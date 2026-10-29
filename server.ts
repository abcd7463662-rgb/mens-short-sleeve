import express from 'express';
import path from 'path';
import fs from 'fs';
import { createHash } from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const GOOGLE_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Translated titles are cached because a sheet almost always repeats the same
// title across colors/sizes. This keeps a 300-row sheet at a few dozen real calls.
const translationCache = new Map<string, string>();
const TRANSLATION_CACHE_LIMIT = 5000;

function rememberTranslation(key: string, value: string) {
  if (translationCache.size >= TRANSLATION_CACHE_LIMIT) {
    const oldest = translationCache.keys().next().value;
    if (oldest !== undefined) translationCache.delete(oldest);
  }
  translationCache.set(key, value);
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const mutationQueues = new Map<string, Promise<void>>();
async function withMutationLock<T>(key: string, action: () => Promise<T>): Promise<T> {
  const previous = mutationQueues.get(key) || Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const tail = previous.then(() => current);
  mutationQueues.set(key, tail);
  await previous;
  try {
    return await action();
  } finally {
    release();
    if (mutationQueues.get(key) === tail) mutationQueues.delete(key);
  }
}

const runWithImageSlot = (() => {
  const limit = Math.max(1, Number(process.env.IMAGE_API_CONCURRENCY) || 12);
  let available = limit;
  const waiters: Array<() => void> = [];
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (available > 0) available -= 1;
    else await new Promise<void>((resolve) => waiters.push(resolve));
    try { return await task(); }
    finally {
      const next = waiters.shift();
      if (next) next();
      else available += 1;
    }
  };
})();

/**
 * 上架目标模板的持久化存储。
 *
 * Render 的运行时磁盘是临时的，重新部署就被清空，所以真正的长期存储是 GitHub
 * 仓库里的 template-store 分支（单独分支，提交不会触发重新部署）。
 * 磁盘上的 template_storage/ 只是当前进程的快速副本。
 */
const TEMPLATE_DIR = path.join(process.cwd(), 'template_storage');
const TEMPLATE_FILE = path.join(TEMPLATE_DIR, 'template.xlsx');
const TEMPLATE_META = path.join(TEMPLATE_DIR, 'meta.json');
const STORE_BRANCH = 'template-store';

interface TemplateMeta {
  name: string;
  savedAt: string;
  size: number;
}

function ensureTemplateDir() {
  if (!fs.existsSync(TEMPLATE_DIR)) {
    fs.mkdirSync(TEMPLATE_DIR, { recursive: true });
  }
}

function readTemplateMeta(): TemplateMeta | null {
  try {
    if (!fs.existsSync(TEMPLATE_META)) return null;
    return JSON.parse(fs.readFileSync(TEMPLATE_META, 'utf8')) as TemplateMeta;
  } catch {
    return null;
  }
}

function writeTemplateLocally(buffer: Buffer, meta: TemplateMeta) {
  ensureTemplateDir();
  const suffix = '.' + process.pid + '.' + Math.random().toString(36).slice(2) + '.tmp';
  const templateTemp = TEMPLATE_FILE + suffix;
  const metaTemp = TEMPLATE_META + suffix;
  fs.writeFileSync(templateTemp, buffer);
  fs.writeFileSync(metaTemp, JSON.stringify(meta, null, 2));
  fs.renameSync(templateTemp, TEMPLATE_FILE);
  fs.renameSync(metaTemp, TEMPLATE_META);
}

// 仓库是公开的，所以读取备份不需要令牌；只有写入（上传新模板）才需要 GITHUB_TOKEN
const GITHUB_REPO_DEFAULT = 'abcd7463662-rgb/mens-short-sleeve';
const githubRepo = () => process.env.GITHUB_REPO || GITHUB_REPO_DEFAULT;
const githubCanWrite = () => Boolean(process.env.GITHUB_TOKEN);

function githubHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'mens-short-sleeve-app',
    'Content-Type': 'application/json',
  };
}

/** 读取仓库某个分支上的文件，不存在返回 null */
async function readGithubFile(
  filePath: string
): Promise<{ sha: string; buffer: Buffer } | null> {
  const url = `https://api.github.com/repos/${githubRepo()}/contents/${filePath}?ref=${STORE_BRANCH}`;
  const token = process.env.GITHUB_TOKEN;

  const res = await fetch(url, {
    headers: token
      ? githubHeaders(token)
      : { Accept: 'application/vnd.github+json', 'User-Agent': 'mens-short-sleeve-app' },
  });
  if (!res.ok) return null;

  const data: any = await res.json();
  if (!data?.content) return null;
  return { sha: data.sha, buffer: Buffer.from(data.content, 'base64') };
}

/** 确保 template-store 分支存在（从 main 的最新提交拉出来，不触发重新部署） */
async function ensureStoreBranch(): Promise<boolean> {
  const token = process.env.GITHUB_TOKEN as string;
  const repo = githubRepo();
  const headers = githubHeaders(token);

  const branchRes = await fetch(
    `https://api.github.com/repos/${repo}/branches/${STORE_BRANCH}`,
    { headers }
  );
  if (branchRes.ok) return true;
  if (branchRes.status !== 404) return false;

  const mainRes = await fetch(`https://api.github.com/repos/${repo}/branches/main`, { headers });
  if (!mainRes.ok) return false;
  const mainData: any = await mainRes.json();
  const sha = mainData?.commit?.sha;
  if (!sha) return false;

  const createRes = await fetch(`https://api.github.com/repos/${repo}/git/refs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ref: `refs/heads/${STORE_BRANCH}`, sha }),
  });
  // 422 表示分支已存在，同样可接受
  return createRes.ok || createRes.status === 422;
}

/** 写文件到 template-store 分支 */
async function writeGithubFile(
  filePath: string,
  contentBase64: string,
  message: string
): Promise<void> {
  const token = process.env.GITHUB_TOKEN as string;
  const repo = githubRepo();
  const headers = githubHeaders(token);
  const url = `https://api.github.com/repos/${repo}/contents/${filePath}`;

  const existing = await readGithubFile(filePath);

  const response = await fetch(url, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message,
      content: contentBase64,
      sha: existing?.sha,
      branch: STORE_BRANCH,
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`GitHub 提交失败 (${response.status}): ${detail.slice(0, 200)}`);
  }
}

async function deleteGithubFile(filePath: string, message: string): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GitHub 持久化权限未配置');
  const existing = await readGithubFile(filePath);
  if (!existing) return;
  const response = await fetch(`https://api.github.com/repos/${githubRepo()}/contents/${filePath}`, {
    method: 'DELETE',
    headers: githubHeaders(token),
    body: JSON.stringify({ message, sha: existing.sha, branch: STORE_BRANCH }),
  });
  if (!response.ok) throw new Error(`GitHub 删除失败 (${response.status}): ${(await response.text()).slice(0, 200)}`);
}

/**
 * 把模板提交到 template-store 分支，做到跨重新部署、跨设备长期保存。
 * 未配置 GITHUB_TOKEN 时返回 false，只保留磁盘副本。
 */
async function backupTemplateToGitHub(base64: string, meta: TemplateMeta): Promise<boolean> {
  if (!githubCanWrite()) return false;

  try {
    if (!(await ensureStoreBranch())) {
      console.error('[Template backup] 无法创建或访问 template-store 分支');
      return false;
    }

    await writeGithubFile(
      'template_storage/template.xlsx',
      base64,
      `chore: update upload template (${meta.name})`
    );
    await writeGithubFile(
      'template_storage/meta.json',
      Buffer.from(JSON.stringify(meta, null, 2), 'utf8').toString('base64'),
      `chore: update template metadata (${meta.name})`
    );
    return true;
  } catch (err: any) {
    console.error('[Template backup] GitHub 提交失败:', err?.message || err);
    return false;
  }
}

/**
 * 磁盘上没有模板时，从 template-store 分支恢复。
 * 返回是否恢复了文件。
 */
async function restoreTemplateFromGitHub(): Promise<boolean> {
  if (fs.existsSync(TEMPLATE_FILE)) return true;

  try {
    const file = await readGithubFile('template_storage/template.xlsx');
    if (!file) return false;

    const metaFile = await readGithubFile('template_storage/meta.json');
    let meta: TemplateMeta = {
      name: 'template.xlsx',
      savedAt: new Date().toISOString(),
      size: file.buffer.length,
    };
    if (metaFile) {
      try {
        meta = JSON.parse(metaFile.buffer.toString('utf8')) as TemplateMeta;
      } catch {
        // 元数据损坏时用上面的默认值
      }
    }

    writeTemplateLocally(file.buffer, meta);
    console.log(`[Template] 已从 GitHub ${STORE_BRANCH} 分支恢复模板: ${meta.name}`);
    return true;
  } catch (err: any) {
    console.error('[Template restore] 从 GitHub 恢复失败:', err?.message || err);
    return false;
  }
}

// 并发请求共用同一次恢复；失败后短暂冷却，避免每次请求都打 GitHub
let restorePromise: Promise<boolean> | null = null;
let lastRestoreFailureAt = 0;
const RESTORE_RETRY_MS = 60_000;

async function restoreTemplateOnce(): Promise<boolean> {
  if (fs.existsSync(TEMPLATE_FILE)) return true;
  if (Date.now() - lastRestoreFailureAt < RESTORE_RETRY_MS) return false;

  if (!restorePromise) {
    restorePromise = restoreTemplateFromGitHub()
      .then((restored) => {
        if (!restored) lastRestoreFailureAt = Date.now();
        return restored;
      })
      .finally(() => {
        restorePromise = null;
      });
  }
  return restorePromise;
}

/**
 * Google's public endpoints answer HTTP 429 as soon as a handful of requests
 * overlap, and the failure is silent (it just returns the source text). Keep the
 * whole server at two in-flight calls and queue the rest.
 */
const runWithTranslateSlot = (() => {
  const limit = Math.max(1, Number(process.env.TRANSLATE_CONCURRENCY) || 8);
  let available = limit;
  const waiters: Array<() => void> = [];

  return async function run<T>(task: () => Promise<T>): Promise<T> {
    if (available > 0) {
      available -= 1;
    } else {
      await new Promise<void>((resolve) => waiters.push(resolve));
    }
    try {
      return await task();
    } finally {
      const next = waiters.shift();
      if (next) next();
      else available += 1;
    }
  };
})();

/**
 * Recursively search and extract GENERATED image URL or Base64 data from MaiziTech API response structure.
 * CRITICAL: Must NEVER extract from 'params', 'input', 'request', or 'images' within params,
 * which contain the user's original reference input image!
 */
function extractOutputImageUrl(data: any): string | null {
  if (!data || typeof data !== 'object') return null;

  // 1. MaiziTech explicit result fields (Highest priority)
  // Example: "result_urls": ["https://cdn-yxu7zakna342.vultrcdn.com/results/api/2026/09/22/20260922_d39385d5dd.jpeg"]
  if (Array.isArray(data.result_urls) && data.result_urls.length > 0) {
    for (const url of data.result_urls) {
      if (typeof url === 'string' && url.trim().length > 0) {
        return url.trim();
      }
    }
  }

  // Example: "thumbnail_urls": ["https://..."]
  if (Array.isArray(data.thumbnail_urls) && data.thumbnail_urls.length > 0) {
    for (const url of data.thumbnail_urls) {
      if (typeof url === 'string' && url.trim().length > 0) {
        return url.trim();
      }
    }
  }

  if (typeof data.result_url === 'string' && data.result_url.trim()) {
    return data.result_url.trim();
  }

  // 2. OpenAI-compatible format: data: [{ url: '...', b64_json: '...' }]
  if (Array.isArray(data.data) && data.data.length > 0) {
    for (const item of data.data) {
      if (typeof item?.url === 'string' && item.url.trim()) return item.url.trim();
      if (typeof item?.image_url === 'string' && item.image_url.trim()) return item.image_url.trim();
      if (typeof item?.b64_json === 'string' && item.b64_json.trim()) {
        return `data:image/png;base64,${item.b64_json.trim()}`;
      }
    }
  }

  // 3. Other known response containers (output, result, artifacts, generations)
  // Exclude 'params' and 'input' to avoid picking up the user's original reference picture
  const outputContainers = [
    data.output,
    data.result,
    data.artifacts,
    data.generations,
    data.response,
  ];

  for (const container of outputContainers) {
    if (!container) continue;

    if (Array.isArray(container) && container.length > 0) {
      for (const item of container) {
        if (typeof item === 'string' && (item.startsWith('http://') || item.startsWith('https://') || item.startsWith('data:image/'))) {
          return item.trim();
        }
        if (item && typeof item === 'object') {
          const found = extractOutputImageUrl(item);
          if (found) return found;
        }
      }
    } else if (typeof container === 'object') {
      const found = extractOutputImageUrl(container);
      if (found) return found;
    } else if (typeof container === 'string' && (container.startsWith('http://') || container.startsWith('https://') || container.startsWith('data:image/'))) {
      return container.trim();
    }
  }

  // 4. Direct top-level output keys (excluding params/input/prompt/model)
  const directOutputKeys = ['url', 'image_url', 'imageUrl', 'download_url', 'file_url'];
  for (const key of directOutputKeys) {
    if (typeof data[key] === 'string') {
      const val = data[key].trim();
      if (val.startsWith('http://') || val.startsWith('https://') || val.startsWith('data:image/')) {
        return val;
      }
    }
  }

  return null;
}

/**
 * Extract task status, progress percentage, and error message
 */
function extractTaskStatus(data: any): { status: string; progress?: number; errorMsg?: string } {
  if (!data || typeof data !== 'object') {
    return { status: 'pending' };
  }

  const rawStatus = (
    data.status ||
    data.display_status ||
    data.state ||
    data.task_status ||
    (Array.isArray(data.data) ? data.data[0]?.status : null) ||
    data.task?.status ||
    'pending'
  )
    .toString()
    .toLowerCase()
    .trim();

  const progress = typeof data.progress === 'number' ? data.progress : undefined;
  const errorMsg = data.error_msg || data.error?.message || data.message || undefined;

  return { status: rawStatus, progress, errorMsg };
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Support JSON payload up to 50MB for image data URIs
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      hasMaiziKey: Boolean(process.env.MAIZI_API_KEY || process.env.MAIZITECH_API_KEY),
    });
  });

  const CATEGORY_TEMPLATE_CATEGORIES = [
    'men-tee',
    'womens-plus-tee',
    'womens-standard-tee',
    'womens-sport-tee',
  ] as const;
  const resolveCategoryTemplate = (value: unknown) =>
    typeof value === 'string' && CATEGORY_TEMPLATE_CATEGORIES.includes(value as (typeof CATEGORY_TEMPLATE_CATEGORIES)[number])
      ? value
      : null;
  const categoryTemplateCosSettings = () => ({
    secretId: process.env.TENCENT_COS_SECRET_ID || '',
    secretKey: process.env.TENCENT_COS_SECRET_KEY || '',
    bucket: String(process.env.WOMEN_TENCENT_COS_BUCKET || process.env.TENCENT_COS_BUCKET || '').trim(),
    region: String(process.env.WOMEN_TENCENT_COS_REGION || process.env.TENCENT_COS_REGION || 'ap-guangzhou').trim(),
  });
  const categoryTemplateKeys = (category: string) => ({
    file: 'templates/category-defaults/' + category + '/template.xlsx',
    meta: 'templates/category-defaults/' + category + '/meta.json',
  });
  const getCategoryTemplateCos = async () => {
    const settings = categoryTemplateCosSettings();
    if (!settings.secretId || !settings.secretKey || !settings.bucket) {
      throw new Error('腾讯云 COS 环境变量未配置');
    }
    const COS = (await import('cos-nodejs-sdk-v5')).default;
    return { cos: new COS({ SecretId: settings.secretId, SecretKey: settings.secretKey }), settings };
  };
  const cosGetObject = (cos: any, settings: ReturnType<typeof categoryTemplateCosSettings>, Key: string) =>
    new Promise<Buffer | null>((resolve, reject) => cos.getObject(
      { Bucket: settings.bucket, Region: settings.region, Key },
      (err: any, data: any) => {
        if (err?.statusCode === 404 || err?.code === 'NoSuchKey') { resolve(null); return; }
        if (err) { reject(err); return; }
        resolve(!data?.Body ? null : Buffer.isBuffer(data.Body) ? data.Body : Buffer.from(data.Body));
      }
    ));
  const cosHeadObject = (cos: any, settings: ReturnType<typeof categoryTemplateCosSettings>, Key: string) =>
    new Promise<boolean>((resolve, reject) => cos.headObject(
      { Bucket: settings.bucket, Region: settings.region, Key },
      (err: any) => {
        if (err?.statusCode === 404 || err?.code === 'NoSuchKey') { resolve(false); return; }
        if (err) { reject(err); return; }
        resolve(true);
      }
    ));

  app.get('/api/category-template', async (req, res) => {
    const category = resolveCategoryTemplate(req.query.category);
    if (!category) { res.status(400).json({ error: '无效的商品类目' }); return; }
    try {
      const { cos, settings } = await getCategoryTemplateCos();
      const keys = categoryTemplateKeys(category);
      const [metaBuffer, fileExists] = await Promise.all([
        cosGetObject(cos, settings, keys.meta),
        cosHeadObject(cos, settings, keys.file),
      ]);
      if (!metaBuffer || !fileExists) { res.json({ exists: false }); return; }
      const meta = JSON.parse(metaBuffer.toString('utf8'));
      res.json({ exists: true, name: meta.name || category + '-template.xlsx', savedAt: meta.savedAt, size: meta.size });
    } catch (error: any) {
      res.status(503).json({ error: error.message || '读取腾讯云模板失败' });
    }
  });

  app.get('/api/category-template/file', async (req, res) => {
    const category = resolveCategoryTemplate(req.query.category);
    if (!category) { res.status(400).json({ error: '无效的商品类目' }); return; }
    try {
      const { cos, settings } = await getCategoryTemplateCos();
      const keys = categoryTemplateKeys(category);
      const [file, metaBuffer] = await Promise.all([
        cosGetObject(cos, settings, keys.file),
        cosGetObject(cos, settings, keys.meta),
      ]);
      if (!file || !metaBuffer) { res.status(404).json({ error: '该类目尚未保存上架模板' }); return; }
      const meta = JSON.parse(metaBuffer.toString('utf8'));
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="' + encodeURIComponent(meta.name || category + '-template.xlsx') + '"');
      res.setHeader('Cache-Control', 'no-store');
      res.send(file);
    } catch (error: any) {
      res.status(503).json({ error: error.message || '读取腾讯云模板失败' });
    }
  });

  app.post('/api/category-template', async (req, res) => {
    const category = resolveCategoryTemplate(req.query.category || req.body?.category);
    if (!category) { res.status(400).json({ error: '无效的商品类目' }); return; }
    const { fileBase64, filename } = req.body || {};
    if (typeof fileBase64 !== 'string' || !fileBase64) { res.status(400).json({ error: '缺少模板文件数据' }); return; }
    const safeName = path.basename(String(filename || 'template.xlsx'));
    if (!/\.xlsx$/i.test(safeName)) { res.status(400).json({ error: '模板必须为 .xlsx 格式' }); return; }
    const buffer = Buffer.from(fileBase64.replace(/^data:[^;]+;base64,/, ''), 'base64');
    if (!buffer.length || buffer.length > 35 * 1024 * 1024 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
      res.status(400).json({ error: '模板文件无效、为空或超过 35 MB' }); return;
    }
    try {
      await withMutationLock('category-template:' + category, async () => {
        const { cos, settings } = await getCategoryTemplateCos();
        const keys = categoryTemplateKeys(category);
        const savedAt = new Date().toISOString();
        const meta = Buffer.from(JSON.stringify({ name: safeName, savedAt, size: buffer.length }), 'utf8');
        const put = (Key: string, Body: Buffer, ContentType: string) => new Promise<void>((resolve, reject) => cos.putObject(
          { Bucket: settings.bucket, Region: settings.region, Key, Body, ContentType },
          (error: any) => error ? reject(error) : resolve()
        ));
        await put(keys.file, buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        await put(keys.meta, meta, 'application/json; charset=utf-8');
        res.json({ success: true, permanent: true, name: safeName, size: buffer.length, savedAt });
      });
    } catch (error: any) {
      res.status(502).json({ error: error.message || '模板保存到腾讯云失败' });
    }
  });

  app.delete('/api/category-template', async (req, res) => {
    const category = resolveCategoryTemplate(req.query.category);
    if (!category) { res.status(400).json({ error: '无效的商品类目' }); return; }
    try {
      await withMutationLock('category-template:' + category, async () => {
        const { cos, settings } = await getCategoryTemplateCos();
        const keys = categoryTemplateKeys(category);
        const remove = (Key: string) => new Promise<void>((resolve, reject) => cos.deleteObject(
          { Bucket: settings.bucket, Region: settings.region, Key },
          (error: any) => error ? reject(error) : resolve()
        ));
        await Promise.all([remove(keys.file), remove(keys.meta)]);
        res.json({ success: true });
      });
    } catch (error: any) {
      res.status(502).json({ error: error.message || '删除腾讯云模板失败' });
    }
  });

  // --- 上架目标模板：服务端持久化 ---
  ensureTemplateDir();
  // 启动时预热：磁盘被重新部署清空的话，这里就把 GitHub 上的备份拉回来
  void restoreTemplateOnce();

  app.get('/api/template', async (req, res) => {
    // 磁盘是临时的，重新部署后第一次访问时把 GitHub 上的备份拉回来
    await restoreTemplateOnce();

    if (!fs.existsSync(TEMPLATE_FILE)) {
      res.json({ exists: false });
      return;
    }
    const meta = readTemplateMeta();
    res.json({
      exists: true,
      name: meta?.name || 'saved-template.xlsx',
      savedAt: meta?.savedAt || fs.statSync(TEMPLATE_FILE).mtime.toISOString(),
      size: fs.statSync(TEMPLATE_FILE).size,
      backupToGitHub: githubCanWrite(),
    });
  });

  app.get('/api/template/file', async (req, res) => {
    await restoreTemplateOnce();

    if (!fs.existsSync(TEMPLATE_FILE)) {
      res.status(404).json({ error: '尚未保存上架模板' });
      return;
    }
    const meta = readTemplateMeta();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(meta?.name || 'template.xlsx')}"`
    );
    res.setHeader('Cache-Control', 'no-store');
    fs.createReadStream(TEMPLATE_FILE).pipe(res);
  });

  const WOMEN_TEMPLATE_DIR = path.join(process.cwd(), 'women_template_storage');
  const WOMEN_PROFILES_FILE = path.join(WOMEN_TEMPLATE_DIR, 'profiles.json');
  const WOMEN_PROFILES_BRANCH_PATH = 'women_template_storage/profiles.json';
  const getWomenProfileFile = (id: string) => path.join(WOMEN_TEMPLATE_DIR, 'profiles', `${id}.xlsx`);
  const getWomenProfileBranchPath = (id: string) => `women_template_storage/profiles/${id}.xlsx`;
  const readWomenProfiles = (): any[] => {
    try { return JSON.parse(fs.readFileSync(WOMEN_PROFILES_FILE, 'utf8')); } catch { return []; }
  };
  const writeWomenProfiles = async (profiles: any[]) => {
    fs.mkdirSync(WOMEN_TEMPLATE_DIR, { recursive: true });
    const temp = WOMEN_PROFILES_FILE + '.' + process.pid + '.' + Math.random().toString(36).slice(2) + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(profiles, null, 2));
    fs.renameSync(temp, WOMEN_PROFILES_FILE);
    if (githubCanWrite() && await ensureStoreBranch()) {
      await writeGithubFile(WOMEN_PROFILES_BRANCH_PATH, Buffer.from(JSON.stringify(profiles, null, 2)).toString('base64'), 'chore: update saved women template profiles');
    }
  };
  const restoreWomenProfiles = async () => {
    if (fs.existsSync(WOMEN_PROFILES_FILE)) return readWomenProfiles();
    try {
      const saved = await readGithubFile(WOMEN_PROFILES_BRANCH_PATH);
      if (!saved) return [];
      fs.mkdirSync(WOMEN_TEMPLATE_DIR, { recursive: true });
      fs.writeFileSync(WOMEN_PROFILES_FILE, saved.buffer);
      return readWomenProfiles();
    } catch { return []; }
  };
  const LEGACY_WOMEN_TEMPLATE_DIR = path.join(process.cwd(), 'women_template_storage');
  const WOMEN_TEMPLATE_CATEGORIES = ['womens-plus-tee', 'womens-standard-tee', 'womens-sport-tee'] as const;
  const getWomenTemplatePaths = (category: string) => {
    const dir = path.join(WOMEN_TEMPLATE_DIR, category);
    const categoryPaths = { dir, file: path.join(dir, 'template.xlsx'), meta: path.join(dir, 'meta.json') };
    if (category === 'womens-plus-tee' && !fs.existsSync(categoryPaths.file)) {
      const legacy = { dir: LEGACY_WOMEN_TEMPLATE_DIR, file: path.join(LEGACY_WOMEN_TEMPLATE_DIR, 'template.xlsx'), meta: path.join(LEGACY_WOMEN_TEMPLATE_DIR, 'meta.json') };
      if (fs.existsSync(legacy.file)) return legacy;
    }
    return categoryPaths;
  };
  const resolveWomenCategory = (value: unknown) =>
    typeof value === 'string' && WOMEN_TEMPLATE_CATEGORIES.includes(value as (typeof WOMEN_TEMPLATE_CATEGORIES)[number])
      ? value
      : null;
  const womenCosSettings = () => ({
    secretId: process.env.TENCENT_COS_SECRET_ID || '',
    secretKey: process.env.TENCENT_COS_SECRET_KEY || '',
    bucket: String(process.env.WOMEN_TENCENT_COS_BUCKET || process.env.TENCENT_COS_BUCKET || '').trim(),
    region: String(process.env.WOMEN_TENCENT_COS_REGION || process.env.TENCENT_COS_REGION || 'ap-guangzhou').trim(),
  });
  const readWomenCosIndex = async (category: string): Promise<any[]> => {
    const settings = womenCosSettings();
    if (!settings.secretId || !settings.secretKey || !settings.bucket) return [];
    const COS = (await import('cos-nodejs-sdk-v5')).default;
    const cos = new COS({ SecretId: settings.secretId, SecretKey: settings.secretKey });
    return new Promise((resolve) => cos.getObject({ Bucket: settings.bucket, Region: settings.region, Key: 'templates/custom/' + category + '/index.json' }, (err: any, data: any) => {
      if (err || !data?.Body) { resolve([]); return; }
      try { resolve(JSON.parse(Buffer.isBuffer(data.Body) ? data.Body.toString('utf8') : String(data.Body))); } catch { resolve([]); }
    }));
  };

  /** 将自定义模板及其识别配置永久备份到腾讯云 COS。 */
  app.post('/api/women/templates/cos-backup', async (req, res) => {
    try {
      const { secretId, secretKey, bucket, region } = womenCosSettings();
      if (!secretId || !secretKey || !bucket) { res.status(503).json({ error: '腾讯云 COS 环境变量未配置' }); return; }
      const { id, fileBase64, profile } = req.body || {};
      const category = resolveWomenCategory(req.body?.category || profile?.category);
      if (!category) { res.status(400).json({ error: '无效的模板类目' }); return; }
      if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(id) || typeof fileBase64 !== 'string' || !fileBase64) { res.status(400).json({ error: '模板档案数据无效' }); return; }
      const buffer = Buffer.from(fileBase64.replace(/^data:[^;]+;base64,/, ''), 'base64');
      if (!buffer.length) { res.status(400).json({ error: '模板文件为空' }); return; }
      const COS = (await import('cos-nodejs-sdk-v5')).default;
      const cos = new COS({ SecretId: secretId, SecretKey: secretKey });
      const put = (Key: string, Body: Buffer, ContentType: string) => new Promise<void>((resolve, reject) => cos.putObject({ Bucket: bucket, Region: region, Key, Body, ContentType }, (err: any) => err ? reject(err) : resolve()));
      const prefix = 'templates/custom/' + category + '/' + id;
      await withMutationLock('women-template-index:' + category, async () => {
        await put(prefix + '/template.xlsx', buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        await put(prefix + '/profile.json', Buffer.from(JSON.stringify(profile || {}, null, 2), 'utf8'), 'application/json; charset=utf-8');
        const existing = await readWomenCosIndex(category);
        const next = [...existing.filter((item) => item.id !== id), { ...profile, id, category, size: buffer.length, savedAt: new Date().toISOString() }];
        await put('templates/custom/' + category + '/index.json', Buffer.from(JSON.stringify(next, null, 2), 'utf8'), 'application/json; charset=utf-8');
      });
      res.json({ success: true, permanent: true, bucket, region, prefix, templateUrl: 'https://' + bucket + '.cos.' + region + '.myqcloud.com/' + prefix + '/template.xlsx' });
    } catch (err: any) { res.status(500).json({ error: err.message || '腾讯云模板备份失败' }); }
  });

  app.get('/api/women/templates', async (req, res) => {
    const category = resolveWomenCategory(req.query.category);
    if (!category) { res.status(400).json({ error: '无效的模板类目' }); return; }
    const cosProfiles = await readWomenCosIndex(category);
    const localProfiles = (await restoreWomenProfiles()).filter((profile) => (profile.category || 'womens-plus-tee') === category);
    const byId = new Map([...localProfiles, ...cosProfiles].map((profile) => [profile.id, profile]));
    res.json([...byId.values()]);
  });

  app.get('/api/women/templates/:id/file', async (req, res) => {
    const id = String(req.params.id || '');
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) { res.status(400).json({ error: '模板编号无效' }); return; }
    const profiles = await restoreWomenProfiles();
    const category = resolveWomenCategory(req.query.category) || resolveWomenCategory(profiles.find((item) => item.id === id)?.category);
    if (category) {
      try {
        const settings = womenCosSettings();
        if (settings.secretId && settings.secretKey && settings.bucket) {
          const COS = (await import('cos-nodejs-sdk-v5')).default;
          const cos = new COS({ SecretId: settings.secretId, SecretKey: settings.secretKey });
          const body = await new Promise<Buffer | null>((resolve) => cos.getObject({ Bucket: settings.bucket, Region: settings.region, Key: 'templates/custom/' + category + '/' + id + '/template.xlsx' }, (err: any, data: any) => resolve(err || !data?.Body ? null : Buffer.isBuffer(data.Body) ? data.Body : Buffer.from(data.Body))));
          if (body) { res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); res.setHeader('Cache-Control', 'no-store'); res.send(body); return; }
        }
      } catch (error) { console.warn('COS template read fallback:', error); }
    }
    let file = getWomenProfileFile(id);
    if (!fs.existsSync(file)) {
      try {
        const saved = await readGithubFile(getWomenProfileBranchPath(id));
        if (saved) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, saved.buffer); }
      } catch { /* 返回未找到 */ }
    }
    if (!fs.existsSync(file)) { res.status(404).json({ error: '找不到已保存模板文件' }); return; }
    const profile = profiles.find((item) => item.id === id);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(profile?.filename || 'template.xlsx')}"`);
    res.setHeader('Cache-Control', 'no-store');
    fs.createReadStream(file).pipe(res);
  });

  app.post('/api/women/templates', async (req, res) => {
    try {
      const { id, name, filename, fileBase64, config } = req.body || {};
      const category = resolveWomenCategory(req.body?.category);
      if (!category) { res.status(400).json({ error: '无效的模板类目' }); return; }
      if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(id) || typeof name !== 'string' || !name.trim()) { res.status(400).json({ error: '请提供有效的模板名称' }); return; }
      if (typeof fileBase64 !== 'string' || !fileBase64) { res.status(400).json({ error: '请选择模板文件' }); return; }
      const buffer = Buffer.from(fileBase64.replace(/^data:[^;]+;base64,/, ''), 'base64');
      if (!buffer.length) { res.status(400).json({ error: '模板文件为空' }); return; }
      await withMutationLock('women-template-profiles', async () => {
        const file = getWomenProfileFile(id);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const temp = file + '.' + process.pid + '.' + Math.random().toString(36).slice(2) + '.tmp';
        fs.writeFileSync(temp, buffer);
        fs.renameSync(temp, file);
        const profiles = await restoreWomenProfiles();
        const profile = { id, category, name: name.trim().slice(0, 100), filename: path.basename(String(filename || 'template.xlsx')), config, savedAt: new Date().toISOString(), size: buffer.length };
        const next = [...profiles.filter((item) => item.id !== id), profile];
        await writeWomenProfiles(next);
        res.json({ success: true, permanent: true, profile });
      });
    } catch (err: any) { res.status(500).json({ error: err.message || '保存模板失败' }); }
  });

  app.delete('/api/women/templates/:id', async (req, res) => {
    const id = String(req.params.id || '');
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) { res.status(400).json({ error: '模板编号无效' }); return; }
    try {
      await withMutationLock('women-template-profiles', async () => {
      const profiles = await restoreWomenProfiles();
      const profile = profiles.find((item) => item.id === id);
      const category = resolveWomenCategory(req.query.category || profile?.category);
      if (category) {
        const settings = womenCosSettings();
        if (!settings.secretId || !settings.secretKey || !settings.bucket) { res.status(503).json({ error: '腾讯云 COS 环境变量未配置，无法删除永久模板' }); return; }
        const COS = (await import('cos-nodejs-sdk-v5')).default;
        const cos = new COS({ SecretId: settings.secretId, SecretKey: settings.secretKey });
        const remove = (Key: string) => new Promise<void>((resolve, reject) => cos.deleteObject({ Bucket: settings.bucket, Region: settings.region, Key }, (err: any) => err ? reject(err) : resolve()));
        await withMutationLock('women-template-index:' + category, async () => {
          await remove('templates/custom/' + category + '/' + id + '/template.xlsx');
          await remove('templates/custom/' + category + '/' + id + '/profile.json');
          const index = (await readWomenCosIndex(category)).filter((item) => item.id !== id);
          await new Promise<void>((resolve, reject) => cos.putObject({ Bucket: settings.bucket, Region: settings.region, Key: 'templates/custom/' + category + '/index.json', Body: Buffer.from(JSON.stringify(index, null, 2)), ContentType: 'application/json; charset=utf-8' }, (err: any) => err ? reject(err) : resolve()));
        });
      }
      const file = getWomenProfileFile(id);
      if (fs.existsSync(file)) fs.unlinkSync(file);
      const nextProfiles = (await restoreWomenProfiles()).filter((item) => item.id !== id);
      await writeWomenProfiles(nextProfiles);
      res.json({ success: true });
      });
    } catch (err: any) { res.status(500).json({ error: err.message || '删除模板失败' }); }
  });

  app.get('/api/women/template', (req, res) => {
    const category = resolveWomenCategory(req.query.category);
    if (!category) { res.status(400).json({ error: '无效的商品类目' }); return; }
    const paths = getWomenTemplatePaths(category);
    if (!fs.existsSync(paths.file)) { res.json({ exists: false }); return; }
    let meta: any = {};
    try { meta = JSON.parse(fs.readFileSync(paths.meta, 'utf8')); } catch { meta = {}; }
    res.json({ exists: true, name: meta.name || `${category}-template.xlsx`, savedAt: meta.savedAt });
  });

  app.get('/api/women/template/file', (req, res) => {
    const category = resolveWomenCategory(req.query.category);
    if (!category) { res.status(400).json({ error: '无效的商品类目' }); return; }
    const paths = getWomenTemplatePaths(category);
    if (!fs.existsSync(paths.file)) { res.status(404).json({ error: '该类目尚未保存上架模板' }); return; }
    let meta: any = {};
    try { meta = JSON.parse(fs.readFileSync(paths.meta, 'utf8')); } catch { meta = {}; }
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(meta.name || `${category}-template.xlsx`)}"`);
    res.setHeader('Cache-Control', 'no-store');
    fs.createReadStream(paths.file).pipe(res);
  });

  app.post('/api/women/template', (req, res) => {
    try {
      const { fileBase64, filename } = req.body;
      const category = resolveWomenCategory(req.query.category || req.body.category);
      if (!category) { res.status(400).json({ error: '无效的商品类目' }); return; }
      const paths = getWomenTemplatePaths(category);
      if (typeof fileBase64 !== 'string' || !fileBase64) {
        res.status(400).json({ error: '缺少模板文件数据' });
        return;
      }
      const buffer = Buffer.from(fileBase64.replace(/^data:[^;]+;base64,/, ''), 'base64');
      if (!buffer.length) {
        res.status(400).json({ error: '模板文件为空' });
        return;
      }
      withMutationLock('category-template:' + category, async () => {
        fs.mkdirSync(paths.dir, { recursive: true });
        const safeName = path.basename(String(filename || 'women-template.xlsx'));
        const suffix = '.' + process.pid + '.' + Math.random().toString(36).slice(2) + '.tmp';
        const metaPath = paths.meta + suffix;
        const filePath = paths.file + suffix;
        fs.writeFileSync(filePath, buffer);
        fs.writeFileSync(metaPath, JSON.stringify({ name: safeName, savedAt: new Date().toISOString(), size: buffer.length }, null, 2));
        fs.renameSync(filePath, paths.file);
        fs.renameSync(metaPath, paths.meta);
        res.json({ success: true, name: safeName });
      }).catch((error) => {
        if (!res.headersSent) res.status(500).json({ error: error.message || '保存女士模板失败' });
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || '保存女士模板失败' });
    }
  });

  app.delete('/api/women/template', (req, res) => {
    try {
      const category = resolveWomenCategory(req.query.category);
      if (!category) { res.status(400).json({ error: '无效的商品类目' }); return; }
      void withMutationLock('category-template:' + category, async () => {
        const paths = getWomenTemplatePaths(category);
        if (category === 'womens-plus-tee' && paths.dir === LEGACY_WOMEN_TEMPLATE_DIR) {
          for (const file of [paths.file, paths.meta]) if (fs.existsSync(file)) fs.unlinkSync(file);
        } else {
          fs.rmSync(paths.dir, { recursive: true, force: true });
        }
        res.json({ success: true });
      }).catch((error) => {
        if (!res.headersSent) res.status(500).json({ error: error.message || '删除女士模板失败' });
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || '删除女士模板失败' });
    }
  });

  const STORE_LINKS_KEYS = {
    'YXIG店': 'YXIG店',
    'Yxig店': 'Yxig店',
    'Y店': 'Yxig店',
    'Hidden Power Clothing': 'Hidden Power Clothing',
    'H店': 'Hidden Power Clothing',
  } as const;
  const getStoreLinksKey = (value: unknown) => typeof value === 'string' && Object.prototype.hasOwnProperty.call(STORE_LINKS_KEYS, value)
    ? STORE_LINKS_KEYS[value as keyof typeof STORE_LINKS_KEYS]
    : null;
  const getStoreLinksSettings = () => ({
    secretId: process.env.TENCENT_COS_SECRET_ID || '',
    secretKey: process.env.TENCENT_COS_SECRET_KEY || '',
    bucket: String(process.env.WOMEN_TENCENT_COS_BUCKET || process.env.TENCENT_COS_BUCKET || '').trim(),
    region: String(process.env.WOMEN_TENCENT_COS_REGION || process.env.TENCENT_COS_REGION || 'ap-guangzhou').trim(),
  });
  const parseStoreLinks = (value: string): string[] => {
    try {
      const parsed = JSON.parse(value);
      const urls = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.urls) ? parsed.urls : [];
      return urls.map((url: unknown) => String(url || '').trim()).filter((url: string) => /^https?:\/\//i.test(url));
    } catch {
      return value.split(/[\r\n]+/).map((line) => line.trim()).filter((line) => /^https?:\/\//i.test(line));
    }
  };
  const readStoreLinks = async (storeName: string) => {
    const legacyNames = storeName === 'Yxig店' ? ['Y店'] : storeName === 'Hidden Power Clothing' ? ['H店'] : [];
    const keyNames = [storeName, ...legacyNames];
    const collected = new Set<string>();
    const settings = getStoreLinksSettings();
    if (settings.secretId && settings.secretKey && settings.bucket) {
      try {
        const COS = (await import('cos-nodejs-sdk-v5')).default;
        const cos = new COS({ SecretId: settings.secretId, SecretKey: settings.secretKey });
        const getObjectBody = (Key: string) => new Promise<Buffer | null>((resolve, reject) => {
          const timer = setTimeout(() => resolve(null), 6000);
          cos.getObject({ Bucket: settings.bucket, Region: settings.region, Key }, (err: any, data: any) => {
          clearTimeout(timer);
          if (!err) {
            resolve(!data?.Body ? null : Buffer.isBuffer(data.Body) ? data.Body : Buffer.from(data.Body));
            return;
          }
          if (err.statusCode === 404 || err.code === 'NoSuchKey' || err.code === 'NotFound') resolve(null);
          else reject(err);
          });
        });
        const keys = keyNames.flatMap((keyName) => [keyName, keyName + '.json']);
        const bodies = await Promise.all(keys.map((key) => getObjectBody(key).catch(() => null)));
        bodies.forEach((body) => {
          if (body) parseStoreLinks(body.toString('utf8')).forEach((url) => collected.add(url));
        });
      } catch (error) {
        console.warn('COS store links read failed, falling back to local cache:', error);
      }
    }
    for (const keyName of keyNames) {
      try { parseStoreLinks(fs.readFileSync(path.join(process.cwd(), 'store_records', keyName + '.json'), 'utf8')).forEach((url) => collected.add(url)); } catch { /* Try the next store key. */ }
    }
    return [...collected];
  };

  app.get('/api/cos/store-links/read', async (req, res) => {
    try {
      const storeName = getStoreLinksKey(req.query.storeName);
      if (!storeName) { res.status(400).json({ error: '店铺名称无效' }); return; }
      const urls = await readStoreLinks(storeName);
      res.json({ success: true, storeName, urls, totalCount: urls.length });
    } catch (error: any) {
      res.status(502).json({ error: error.message || '读取店铺历史链接失败' });
    }
  });

  app.post('/api/cos/store-links/save', async (req, res) => {
    try {
      const storeName = getStoreLinksKey(req.body?.storeName);
      if (!storeName) { res.status(400).json({ error: '店铺名称无效' }); return; }
      const input = Array.isArray(req.body?.urls) ? req.body.urls.map((url: unknown) => String(url || '').trim()).filter((url: string) => /^https?:\/\//i.test(url)) : [];
      await withMutationLock('store-links:' + storeName, async () => {
        const existing = await readStoreLinks(storeName);
        const urls = [...new Set([...existing, ...input])];
        const payload = Buffer.from(JSON.stringify({ store: storeName, updatedAt: new Date().toISOString(), totalCount: urls.length, urls }, null, 2), 'utf8');
        const settings = getStoreLinksSettings();
        if (!settings.secretId || !settings.secretKey || !settings.bucket) { res.status(503).json({ error: '腾讯云 COS 环境变量未配置，历史链接未能永久保存' }); return; }
        const COS = (await import('cos-nodejs-sdk-v5')).default;
        const cos = new COS({ SecretId: settings.secretId, SecretKey: settings.secretKey });
        const put = (Key: string) => new Promise<void>((resolve, reject) => cos.putObject({ Bucket: settings.bucket, Region: settings.region, Key, Body: payload, ContentType: 'application/json; charset=utf-8' }, (err: any) => err ? reject(err) : resolve()));
        await Promise.all([put(storeName), put(storeName + '.json')]);
        const localDir = path.join(process.cwd(), 'store_records');
        fs.mkdirSync(localDir, { recursive: true });
        fs.writeFileSync(path.join(localDir, storeName + '.json'), payload);
        res.json({ success: true, storeName, totalCount: urls.length, addedCount: urls.length - existing.length });
      });
    } catch (error: any) { res.status(500).json({ error: error.message || '保存店铺历史链接失败' }); }
  });

  app.get('/api/cos/status', async (req, res) => {
    const secretId = process.env.TENCENT_COS_SECRET_ID;
    const secretKey = process.env.TENCENT_COS_SECRET_KEY;
    if (!secretId || !secretKey) {
      res.json({ configured: false, buckets: [], error: '服务端尚未配置腾讯云 COS 密钥' });
      return;
    }
    try {
      const COS = (await import('cos-nodejs-sdk-v5')).default;
      const cos = new COS({ SecretId: secretId, SecretKey: secretKey });
      cos.getService((err: any, data: any) => {
        if (err) {
          res.json({ configured: true, error: err.message || '获取存储桶失败', buckets: [] });
          return;
        }
        const buckets = (data.Buckets || []).map((bucket: any) => ({ name: bucket.Name, region: bucket.Location }));
        res.json({
          configured: true,
          owner: data.Owner?.ID || data.Owner?.DisplayName || '',
          buckets,
          defaultBucket: process.env.TENCENT_COS_BUCKET || process.env.WOMEN_TENCENT_COS_BUCKET || '',
          defaultRegion: process.env.TENCENT_COS_REGION || process.env.WOMEN_TENCENT_COS_REGION || 'ap-guangzhou',
        });
      });
    } catch (err: any) {
      res.status(500).json({ configured: false, error: err.message || 'COS 初始化失败' });
    }
  });

  app.post('/api/cos/upload', async (req, res) => {
    const secretId = process.env.TENCENT_COS_SECRET_ID;
    const secretKey = process.env.TENCENT_COS_SECRET_KEY;
    if (!secretId || !secretKey) {
      res.status(503).json({ error: '服务端尚未配置腾讯云 COS 密钥' });
      return;
    }
    try {
      const { imageBase64, imageUrl, filename, bucket, region } = req.body;
      const targetBucket = String(bucket || process.env.WOMEN_TENCENT_COS_BUCKET || process.env.TENCENT_COS_BUCKET || '').trim();
      const targetRegion = String(region || process.env.WOMEN_TENCENT_COS_REGION || process.env.TENCENT_COS_REGION || 'ap-guangzhou').trim();
      if (!targetBucket) {
        res.status(400).json({ error: '请配置腾讯云 COS 存储桶' });
        return;
      }
      let buffer: Buffer | null = null;
      if (typeof imageBase64 === 'string' && imageBase64) {
        buffer = Buffer.from(imageBase64.replace(/^data:image\/[^;]+;base64,/, ''), 'base64');
      } else if (typeof imageUrl === 'string' && imageUrl.startsWith('data:image/')) {
        buffer = Buffer.from(imageUrl.replace(/^data:image\/[^;]+;base64,/, ''), 'base64');
      } else if (typeof imageUrl === 'string' && imageUrl.startsWith('https://')) {
        const response = await fetch(imageUrl, { signal: AbortSignal.timeout(30000) });
        if (response.ok) buffer = Buffer.from(await response.arrayBuffer());
      }
      if (!buffer?.length || buffer.length > 15 * 1024 * 1024) {
        res.status(400).json({ error: '图片数据无效或超过 15MB' });
        return;
      }
      const safeFilename = path.basename(String(filename || 'image.jpg'));
      const contentHash = createHash('sha256').update(buffer).digest('hex').slice(0, 20);
      const objectKey = `${contentHash}_${safeFilename}`;
      const COS = (await import('cos-nodejs-sdk-v5')).default;
      const cos = new COS({ SecretId: secretId, SecretKey: secretKey });
      cos.putObject({
        Bucket: targetBucket,
        Region: targetRegion,
        Key: objectKey,
        Body: buffer,
        ContentType: 'image/jpeg',
        CacheControl: 'public, max-age=31536000, immutable',
        ACL: 'public-read',
      }, (err: any) => {
        if (err) {
          res.status(500).json({ error: err.message || '上传腾讯云失败', code: err.code });
          return;
        }
        res.json({ success: true, url: `https://${targetBucket}.cos.${targetRegion}.myqcloud.com/${encodeURIComponent(objectKey)}`, bucket: targetBucket, region: targetRegion, key: objectKey });
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || '上传腾讯云失败' });
    }
  });

  // 二进制直传：避免 base64 膨胀 33%，大图上传更快
  app.post('/api/cos/upload-binary', express.raw({ type: 'image/*', limit: '15mb' }), async (req, res) => {
    const secretId = process.env.TENCENT_COS_SECRET_ID;
    const secretKey = process.env.TENCENT_COS_SECRET_KEY;
    if (!secretId || !secretKey) {
      res.status(503).json({ error: '服务端尚未配置腾讯云 COS 密钥' });
      return;
    }
    try {
      const targetBucket = String(req.query.bucket || process.env.WOMEN_TENCENT_COS_BUCKET || process.env.TENCENT_COS_BUCKET || '').trim();
      const targetRegion = String(req.query.region || process.env.WOMEN_TENCENT_COS_REGION || process.env.TENCENT_COS_REGION || 'ap-guangzhou').trim();
      if (!targetBucket) {
        res.status(400).json({ error: '请配置腾讯云 COS 存储桶' });
        return;
      }
      const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      if (!buffer.length) {
        res.status(400).json({ error: '图片数据无效' });
        return;
      }
      const safeFilename = path.basename(String(req.query.filename || 'image.jpg'));
      const contentHash = createHash('sha256').update(buffer).digest('hex').slice(0, 20);
      const objectKey = `${contentHash}_${safeFilename}`;
      const COS = (await import('cos-nodejs-sdk-v5')).default;
      const cos = new COS({ SecretId: secretId, SecretKey: secretKey });
      cos.putObject({
        Bucket: targetBucket,
        Region: targetRegion,
        Key: objectKey,
        Body: buffer,
        ContentType: 'image/jpeg',
        CacheControl: 'public, max-age=31536000, immutable',
        ACL: 'public-read',
      }, (err: any) => {
        if (err) {
          res.status(500).json({ error: err.message || '上传腾讯云失败', code: err.code });
          return;
        }
        res.json({ success: true, url: `https://${targetBucket}.cos.${targetRegion}.myqcloud.com/${encodeURIComponent(objectKey)}`, bucket: targetBucket, region: targetRegion, key: objectKey });
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || '上传腾讯云失败' });
    }
  });

  app.post('/api/template', async (req, res) => {
    try {
      const { fileBase64, filename } = req.body;
      if (!fileBase64 || typeof fileBase64 !== 'string') {
        res.status(400).json({ error: '缺少模板文件数据' });
        return;
      }

      const buffer = Buffer.from(fileBase64.replace(/^data:[^;]+;base64,/, ''), 'base64');
      if (buffer.length === 0) {
        res.status(400).json({ error: '模板文件为空' });
        return;
      }

      await withMutationLock('shared-men-template', async () => {
        const meta: TemplateMeta = {
          name: filename || 'template.xlsx',
          savedAt: new Date().toISOString(),
          size: buffer.length,
        };
        writeTemplateLocally(buffer, meta);

        const backedUp = await backupTemplateToGitHub(buffer.toString('base64'), meta);

        res.json({
          success: true,
          name: meta.name,
          savedAt: meta.savedAt,
          size: meta.size,
          backedUp,
          backupConfigured: githubCanWrite(),
        });
      });
    } catch (err: any) {
      console.error('Error in POST /api/template:', err);
      res.status(500).json({ error: err.message || '保存模板失败' });
    }
  });

  app.delete('/api/template', async (req, res) => {
    try {
      await withMutationLock('shared-men-template', async () => {
      if (fs.existsSync(TEMPLATE_FILE)) fs.unlinkSync(TEMPLATE_FILE);
      if (fs.existsSync(TEMPLATE_META)) fs.unlinkSync(TEMPLATE_META);

      // 同步删掉 GitHub 备份，否则下一次读取又会恢复回来
      if (githubCanWrite()) {
        const token = process.env.GITHUB_TOKEN as string;
        const repo = githubRepo();
        for (const filePath of ['template_storage/template.xlsx', 'template_storage/meta.json']) {
          const existing = await readGithubFile(filePath);
          if (!existing) continue;
          await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}`, {
            method: 'DELETE',
            headers: githubHeaders(token),
            body: JSON.stringify({
              message: `chore: clear upload template (${filePath.split('/').pop()})`,
              sha: existing.sha,
              branch: STORE_BRANCH,
            }),
          });
        }
      }
      lastRestoreFailureAt = 0;
      res.json({ success: true });
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || '清除模板失败' });
    }
  });

  // Diagnostics for the Google Translate upstream: run this when titles stop
  // translating to see whether Google is throttling this server's egress IP.
  app.get('/api/translate/diag', async (req, res) => {
    const sample = '男士纯棉短袖T恤 白色圆领';
    const targets = [
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(
        sample
      )}`,
      `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=en&q=${encodeURIComponent(
        sample
      )}`,
    ];

    const results = await Promise.all(
      targets.map(async (url) => {
        const startedAt = Date.now();
        try {
          const response = await fetch(url, {
            headers: { 'User-Agent': GOOGLE_UA, Accept: 'application/json, text/plain, */*' },
            signal: AbortSignal.timeout(15000),
          });
          const body = await response.text();
          return {
            host: new URL(url).host,
            status: response.status,
            ms: Date.now() - startedAt,
            bodyPreview: body.slice(0, 200),
          };
        } catch (err: any) {
          return {
            host: new URL(url).host,
            status: null,
            ms: Date.now() - startedAt,
            error: err?.message || String(err),
          };
        }
      })
    );

    res.json({ cachedEntries: translationCache.size, results });
  });

  // Google Translate API endpoint (translates product titles to English for D6 column)
  app.post('/api/translate', async (req, res) => {
    try {
      const { text, texts, targetLang = 'en', sourceLang = 'auto' } = req.body;

      // Clean titles by thoroughly removing "舒适色彩", "安慰色彩", "棉", "®", "Comfort Colors", "Cotton" and variants, and enforce max 250 characters
      const cleanChinese = (str: string) => {
        let cleaned = (str || '')
          .replace(/[®™\u00AE\u2122]/g, '')
          .replace(/\([rR]\)|（[rR]）|\[[rR]\]|【[rR]】/g, '')
          .replace(/舒\s*适\s*色\s*彩/gi, '')
          .replace(/舒\s*适\s*颜\s*色/gi, '')
          .replace(/舒\s*适\s*色/gi, '')
          .replace(/安\s*慰\s*色\s*彩/gi, '')
          .replace(/安\s*慰\s*颜\s*色/gi, '')
          .replace(/安\s*慰\s*色/gi, '')
          .replace(/\bcomfort\s*-?\s*colou?rs?\b/gi, '')
          .replace(/comfortcolou?rs?/gi, '')
          .replace(/\bcomfortable\s*colou?rs?\b/gi, '')
          .replace(/100%\s*(纯棉|全棉|棉质|有机棉|棉)/gi, '')
          .replace(/纯棉|全棉|棉质|有机棉|涤棉|精梳棉|水洗棉|针织棉|重磅棉|丝光棉|长绒棉/gi, '')
          .replace(/棉/g, '')
          .replace(/\b100%\s*(ringspun\s*|combed\s*|organic\s*|pure\s*|all\s*|heavyweight\s*)?cottons?\b/gi, '')
          .replace(/\b(ringspun|combed|organic|pure|heavyweight)\s+cottons?\b/gi, '')
          .replace(/\bcotton\s*blend\b/gi, '')
          .replace(/\bcotton\s*poly\b/gi, '')
          .replace(/\bcottons?\b/gi, '')
          .replace(/\(\s*\)|\[\s*\]|【\s*】|（\s*）/g, '')
          .replace(/[，,]{2,}/g, ', ')
          .replace(/[-—]{2,}/g, '-')
          .replace(/\s*[|/]\s*[|/]+/g, ' / ')
          .replace(/\s*,\s*-\s*/g, ', ')
          .replace(/\s*-\s*,\s*/g, ', ')
          .replace(/\s{2,}/g, ' ')
          .replace(/^[\s,，\-—_/|]+|[\s,，\-—_/|]+$/g, '')
          .trim();

        if (cleaned.length > 250) {
          cleaned = cleaned.slice(0, 250).replace(/[\s,，\-—_/|]+$/g, '').trim();
        }
        return cleaned;
      };

      const cleanEnglish = (str: string) => {
        let cleaned = (str || '')
          .replace(/[®™\u00AE\u2122]/g, '')
          .replace(/\([rR]\)|（[rR]）|\[[rR]\]|【[rR]】/g, '')
          .replace(/\bcomfort\s*-?\s*colou?rs?\b/gi, '')
          .replace(/\bcomfortable\s*colou?rs?\b/gi, '')
          .replace(/\bsolace\s*colou?rs?\b/gi, '')
          .replace(/\bconsolation\s*colou?rs?\b/gi, '')
          .replace(/comfortcolou?rs?/gi, '')
          .replace(/舒\s*适\s*色\s*彩/gi, '')
          .replace(/舒\s*适\s*颜\s*色/gi, '')
          .replace(/舒\s*适\s*色/gi, '')
          .replace(/安\s*慰\s*色\s*彩/gi, '')
          .replace(/安\s*慰\s*颜\s*色/gi, '')
          .replace(/安\s*慰\s*色/gi, '')
          .replace(/\b100%\s*(ringspun\s*|combed\s*|organic\s*|pure\s*|all\s*|heavyweight\s*)?cottons?\b/gi, '')
          .replace(/\b(ringspun|combed|organic|pure|heavyweight)\s+cottons?\b/gi, '')
          .replace(/\bcotton\s*blend\b/gi, '')
          .replace(/\bcotton\s*poly\b/gi, '')
          .replace(/\bcotton\s*\/\s*poly\b/gi, '')
          .replace(/\bcotton\s*fabric\b/gi, '')
          .replace(/\bcotton\s*material\b/gi, '')
          .replace(/\bcottons?\b/gi, '')
          .replace(/100%\s*(纯棉|全棉|棉质|有机棉|棉)/gi, '')
          .replace(/纯棉|全棉|棉质|有机棉|涤棉|精梳棉|水洗棉|针织棉|重磅棉|丝光棉|长绒棉/gi, '')
          .replace(/棉/g, '')
          .replace(/\(\s*\)|\[\s*\]|【\s*】|（\s*）/g, '')
          .replace(/[,，]{2,}/g, ', ')
          .replace(/[-—]{2,}/g, '-')
          .replace(/\s+,\s*/g, ', ')
          .replace(/\s+-\s*-\s*/g, ' - ')
          .replace(/\s*[|/]\s*[|/]+/g, ' / ')
          .replace(/\s*,\s*-\s*/g, ', ')
          .replace(/\s*-\s*,\s*/g, ', ')
          .replace(/\s{2,}/g, ' ')
          .replace(/^[\s,，\-—_/|]+|[\s,，\-—_/|]+$/g, '')
          .trim();

        if (cleaned.length > 250) {
          cleaned = cleaned.slice(0, 250).replace(/[\s,，\-—_/|]+$/g, '').trim();
        }
        return cleaned;
      };

      // One call to Google. Returns null when Google throttled or answered with
      // something unusable, so the caller can retry instead of silently
      // shipping the Chinese source text as the "translation".
      const callGoogle = async (textValue: string, endpoint: 'gtx' | 'dict'): Promise<string | null> => {
        const url =
          endpoint === 'gtx'
            ? `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(
                sourceLang
              )}&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(textValue)}`
            : `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=${encodeURIComponent(
                sourceLang
              )}&tl=${encodeURIComponent(targetLang)}&q=${encodeURIComponent(textValue)}`;

        const response = await fetch(url, {
          headers: { 'User-Agent': GOOGLE_UA, Accept: 'application/json, text/plain, */*' },
          signal: AbortSignal.timeout(15000),
        });

        if (response.status === 429 || response.status === 403 || response.status >= 500) {
          return null;
        }
        if (!response.ok) return null;

        const data: any = await response.json();

        if (endpoint === 'gtx') {
          if (!Array.isArray(data) || !Array.isArray(data[0])) return null;
          const joined = data[0]
            .map((segment: any) => (Array.isArray(segment) ? segment[0] : ''))
            .join('')
            .trim();
          return joined ? cleanEnglish(joined) || null : null;
        }

        if (Array.isArray(data) && typeof data[0] === 'string' && data[0].trim()) {
          return cleanEnglish(data[0].trim()) || null;
        }
        if (typeof data === 'string' && data.trim()) {
          return cleanEnglish(data.trim()) || null;
        }
        return null;
      };

      // Translate a single text, retrying with backoff. Throws if Google stays
      // unhappy so the batch handler can report it instead of faking success.
      const translateSingleText = async (queryText: string): Promise<string> => {
        if (!queryText || !queryText.trim()) return '';
        const trimmed = cleanChinese(queryText.trim());
        if (!trimmed) return '';

        const cacheKey = `${targetLang}::${trimmed}`;
        const cached = translationCache.get(cacheKey);
        if (cached) return cached;

        let lastError: unknown = null;

        for (let attempt = 0; attempt < 4; attempt++) {
          if (attempt > 0) await sleep(400 * 2 ** (attempt - 1) + Math.random() * 250);

          for (const endpoint of ['gtx', 'dict'] as const) {
            try {
              const translated = await runWithTranslateSlot(() => callGoogle(trimmed, endpoint));
              if (translated) {
                rememberTranslation(cacheKey, translated);
                return translated;
              }
            } catch (err) {
              lastError = err;
            }
          }
        }

        throw new Error(
          `谷歌翻译接口暂时不可用（重试 4 次仍未成功）${
            lastError instanceof Error ? `: ${lastError.message}` : ''
          }`
        );
      };

      if (Array.isArray(texts) && texts.length > 0) {
        const results: string[] = new Array(texts.length).fill('');
        const failed: number[] = [];

        // 并发翻译：translateSingleText 内部已有 runWithTranslateSlot 限流，
        // 这里若逐个 await，限流槽位就形同虚设，100 条标题会变成 100 次串行往返。
        const BATCH_CONCURRENCY = Math.max(1, Number(process.env.TRANSLATE_CONCURRENCY) || 8);
        let cursor = 0;
        const translateWorker = async () => {
          while (cursor < texts.length) {
            const i = cursor++;
            const source = String(texts[i] ?? '');
            if (!source.trim()) {
              results[i] = '';
              continue;
            }
            try {
              results[i] = await translateSingleText(source);
            } catch {
              failed.push(i);
            }
          }
        };
        await Promise.all(
          Array.from({ length: Math.min(BATCH_CONCURRENCY, texts.length) }, () => translateWorker())
        );

        // Second pass over the stragglers: the throttle window has usually
        // cleared by now, and this is what turns "many titles untranslated"
        // into a clean result.
        await sleep(600);
        const retryQueue = [...failed];
        const stillFailed: number[] = [];
        let retryCursor = 0;
        const retryWorker = async () => {
          while (retryCursor < retryQueue.length) {
            const i = retryQueue[retryCursor++];
            try {
              results[i] = await translateSingleText(String(texts[i] ?? ''));
            } catch {
              results[i] = '';
              stillFailed.push(i);
            }
          }
        };
        await Promise.all(
          Array.from({ length: Math.min(BATCH_CONCURRENCY, retryQueue.length) }, () => retryWorker())
        );
        failed.length = 0;
        failed.push(...stillFailed.sort((a, b) => a - b));

        res.json({
          success: true,
          translations: results,
          sourceCount: texts.length,
          failedIndexes: failed,
        });
        return;
      }

      if (typeof text === 'string') {
        const translation = await translateSingleText(text);
        res.json({ success: true, translation, originalText: text });
        return;
      }

      res.status(400).json({ error: '请提供要翻译的 text 或 texts 数组' });
    } catch (err: any) {
      console.error('Error in /api/translate:', err);
      res.status(500).json({
        error: err.message || '谷歌翻译服务调用失败',
      });
    }
  });

  // 1. Submit async image generation/editing task
  app.post('/api/image-modify/tasks', async (req, res) => {
    try {
      const apiKey = process.env.MAIZI_API_KEY || process.env.MAIZITECH_API_KEY;

      if (!apiKey || !apiKey.trim() || apiKey === 'sk-your-api-key') {
        res.status(400).json({
          error: '缺少有效的 MAIZI_API_KEY 环境变量，请在平台设置（Settings / Secrets）中配置 MAIZI_API_KEY。',
        });
        return;
      }

      const { model, size, resolution, prompt, images, n, width, height, aspect_ratio } = req.body;

      if (!prompt || typeof prompt !== 'string') {
        res.status(400).json({ error: '请提供有效的修改提示词 (prompt)' });
        return;
      }

      // 按照 gpt-image-2.5 接口标准与电商主图规格
      const enforcedModel = model || 'gpt-image-2.5';
      let enforcedPrompt = prompt.includes('不要更改商品背景')
        ? prompt
        : `${prompt}，不要更改商品背景，保持原图背景完全一致`;
      if (!enforcedPrompt.includes('1340px*1785px')) {
        enforcedPrompt = `${enforcedPrompt}，强制生成条件：图片分辨率及构图必须为 1340px*1785px (3:4 竖版电商主图标准比例)，主体与印花清晰`;
      }

      const requestPayload: any = {
        model: enforcedModel,
        prompt: enforcedPrompt,
        n: 1,
        size: size || '3:4',
        resolution: resolution || (enforcedModel === 'gpt-image-2.5' ? '1K' : '2K'),
      };

      if (images && Array.isArray(images) && images.length > 0) {
        requestPayload.images = images;
      }

      const response = await runWithImageSlot(() => fetch('https://www.maizitech.ai/v1/images/generations', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestPayload),
      }));

      const responseText = await response.text();
      let responseData: any;
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = { text: responseText };
      }

      if (!response.ok) {
        res.status(response.status).json({
          error: responseData.error?.message || responseData.message || `提交任务失败 (${response.status})`,
          raw: responseData,
        });
        return;
      }

      // Check if task_id was returned
      let taskId = '';
      const { status, progress } = extractTaskStatus(responseData);
      const directImageUrl = extractOutputImageUrl(responseData);

      if (Array.isArray(responseData?.data) && responseData.data.length > 0) {
        const item = responseData.data[0];
        if (item.task_id) {
          taskId = item.task_id;
        } else if (item.id) {
          taskId = item.id;
        }
      } else if (responseData?.task_id) {
        taskId = responseData.task_id;
      } else if (responseData?.id) {
        taskId = responseData.id;
      }

      // If direct image URL is returned without async waiting
      if (directImageUrl && (!taskId || status === 'completed')) {
        res.json({
          success: true,
          completed: true,
          status: 'completed',
          imageUrl: directImageUrl,
          data: responseData,
        });
        return;
      }

      if (!taskId) {
        if (directImageUrl) {
          res.json({
            success: true,
            completed: true,
            status: 'completed',
            imageUrl: directImageUrl,
            data: responseData,
          });
          return;
        }

        res.status(500).json({
          error: '上游接口未返回有效的 task_id 或图片数据',
          raw: responseData,
        });
        return;
      }

      res.json({
        success: true,
        completed: false,
        taskId,
        status: status || 'pending',
        progress,
        raw: responseData,
      });
    } catch (err: any) {
      console.error('Error in POST /api/image-modify/tasks:', err);
      res.status(500).json({
        error: err.message || '提交图片生成任务发生内部错误',
      });
    }
  });

  // 2. Poll task status: GET /api/image-modify/tasks/:taskId
  app.get('/api/image-modify/tasks/:taskId', async (req, res) => {
    try {
      const apiKey = process.env.MAIZI_API_KEY || process.env.MAIZITECH_API_KEY;
      const { taskId } = req.params;

      if (!apiKey || !apiKey.trim() || apiKey === 'sk-your-api-key') {
        res.status(400).json({
          error: '缺少有效的 MAIZI_API_KEY 环境变量',
        });
        return;
      }

      if (!taskId) {
        res.status(400).json({ error: '缺少 taskId 参数' });
        return;
      }

      const response = await fetch(`https://www.maizitech.ai/v1/tasks/${taskId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      const responseText = await response.text();
      let responseData: any;
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = { text: responseText };
      }

      const { status: rawStatus, progress, errorMsg } = extractTaskStatus(responseData);
      const imageUrl = extractOutputImageUrl(responseData);

      console.log(`[Task Poll ${taskId}] status=${rawStatus}, progress=${progress ?? 'none'}, hasImage=${!!imageUrl}`);

      let status = rawStatus;
      // Mark as completed ONLY when status is terminal success OR when progress reaches 100 with an image URL
      if (imageUrl && (rawStatus === 'completed' || rawStatus === 'succeeded' || rawStatus === 'success' || progress === 100)) {
        status = 'completed';
      }

      const isFailed = status === 'failed' || status === 'violation' || status === 'error';
      const failReason =
        errorMsg ||
        responseData.reason ||
        (status === 'violation' ? '任务触发安全合规风控 (violation)' : '生成任务失败');

      res.json({
        success: !isFailed,
        taskId,
        status,
        progress: progress ?? (status === 'completed' ? 100 : undefined),
        imageUrl: isFailed ? null : imageUrl,
        error: isFailed ? failReason : undefined,
        raw: responseData,
      });
    } catch (err: any) {
      console.error('Error in GET /api/image-modify/tasks/:taskId:', err);
      res.status(500).json({
        error: err.message || '查询任务状态发生内部错误',
      });
    }
  });

  // Local storage for padded 1340*1785 images
  const HOSTED_IMAGES_DIR = path.join(process.cwd(), 'hosted_images_storage');
  if (!fs.existsSync(HOSTED_IMAGES_DIR)) {
    fs.mkdirSync(HOSTED_IMAGES_DIR, { recursive: true });
  }

  // Store padded 1340*1785 image
  app.post('/api/hosted-images', async (req, res) => {
    try {
      const { imageBase64, filename } = req.body;
      if (!imageBase64 || typeof imageBase64 !== 'string') {
        res.status(400).json({ error: '缺少有效的图片 base64 数据' });
        return;
      }

      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(cleanBase64, 'base64');
      const fileId = filename || `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
      const filePath = path.join(HOSTED_IMAGES_DIR, fileId);

      fs.writeFileSync(filePath, buffer);

      const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || 'localhost:3000';
      const protocol = (req.headers['x-forwarded-proto'] as string) || (req.protocol === 'https' ? 'https' : 'http');
      const publicUrl = `${protocol}://${host}/api/hosted-images/${fileId}`;

      res.json({
        success: true,
        url: publicUrl,
        relativePath: `/api/hosted-images/${fileId}`,
        filename: fileId,
      });
    } catch (err: any) {
      console.error('Error saving hosted image:', err);
      res.status(500).json({ error: err.message || '保存图片失败' });
    }
  });

  // Serve stored 1340*1785 image
  app.get('/api/hosted-images/:filename', (req, res) => {
    try {
      const { filename } = req.params;
      const safeFilename = path.basename(filename);
      const filePath = path.join(HOSTED_IMAGES_DIR, safeFilename);

      if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: '图片不存在或已过期' });
        return;
      }

      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=31536000');

      if (req.query.download === '1') {
        res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
      }

      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
    } catch (err: any) {
      res.status(500).json({ error: err.message || '读取图片失败' });
    }
  });

  // Proxy remote image to prevent CORS or hotlinking issues on client
  app.get('/api/proxy-image', async (req, res) => {
    try {
      const targetUrl = req.query.url as string;
      if (!targetUrl || (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://'))) {
        res.status(400).json({ error: '无效的图片 URL' });
        return;
      }

      const response = await fetch(targetUrl, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) {
        res.status(response.status).json({ error: '获取远程图片失败' });
        return;
      }

      const contentType = response.headers.get('content-type') || 'image/jpeg';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');

      if (req.query.download === '1') {
        res.setHeader('Content-Disposition', `attachment; filename="AI_Modified_${Date.now()}.jpg"`);
      }

      const arrayBuffer = await response.arrayBuffer();
      res.send(Buffer.from(arrayBuffer));
    } catch (err: any) {
      res.status(500).json({ error: err.message || '图片代理错误' });
    }
  });

  // ImgBB upload proxy endpoint
  app.post('/api/upload-imgbb', async (req, res) => {
    try {
      const { imageUrl, imageBase64, expiration, key } = req.body;
      const apiKey = key || process.env.IMGBB_API_KEY || 'a22cdd4b6a277f7b71c92eac74487593';

      let base64Data = imageBase64;
      if (!base64Data && imageUrl) {
        const imgRes = await fetch(imageUrl);
        if (!imgRes.ok) {
          res.status(400).json({ success: false, error: '无法获取要上传的图片' });
          return;
        }
        const arrayBuf = await imgRes.arrayBuffer();
        base64Data = Buffer.from(arrayBuf).toString('base64');
      }

      if (!base64Data) {
        res.status(400).json({ success: false, error: '缺少图片数据或URL' });
        return;
      }

      const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');

      const formData = new URLSearchParams();
      formData.append('key', apiKey);
      formData.append('image', cleanBase64);
      if (expiration) {
        formData.append('expiration', String(expiration));
      }

      const uploadRes = await fetch('https://api.imgbb.com/1/upload', {
        method: 'POST',
        body: formData,
      });

      const uploadJson = await uploadRes.json();
      res.json(uploadJson);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'ImgBB 上传失败' });
    }
  });

  // Legacy/Fallback API: POST /api/image-modify with server-side polling loop
  app.post('/api/image-modify', async (req, res) => {
    try {
      const apiKey = process.env.MAIZI_API_KEY || process.env.MAIZITECH_API_KEY;

      if (!apiKey || !apiKey.trim() || apiKey === 'sk-your-api-key') {
        res.status(400).json({
          error: '缺少有效的 MAIZI_API_KEY 环境变量，请在平台设置（Settings / Secrets）中配置 MAIZI_API_KEY。',
        });
        return;
      }

      const { model, size, resolution, prompt, images, n, width, height, aspect_ratio } = req.body;

      if (!prompt || typeof prompt !== 'string') {
        res.status(400).json({ error: '请提供有效的修改提示词 (prompt)' });
        return;
      }

      const enforcedModel = model || 'gpt-image-2.5';
      let enforcedPrompt = prompt.includes('不要更改商品背景')
        ? prompt
        : `${prompt}，不要更改商品背景，保持原图背景完全一致`;
      if (!enforcedPrompt.includes('1340px*1785px')) {
        enforcedPrompt = `${enforcedPrompt}，强制生成条件：图片分辨率及构图必须为 1340px*1785px (3:4 竖版电商主图标准比例)，主体与印花清晰`;
      }

      const requestPayload: any = {
        model: enforcedModel,
        prompt: enforcedPrompt,
        n: 1,
        size: size || '3:4',
        resolution: resolution || (enforcedModel === 'gpt-image-2.5' ? '1K' : '2K'),
      };

      if (images && Array.isArray(images) && images.length > 0) {
        requestPayload.images = images;
      }

      const submitRes = await runWithImageSlot(() => fetch('https://www.maizitech.ai/v1/images/generations', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestPayload),
      }));

      const submitData: any = await submitRes.json();
      if (!submitRes.ok) {
        res.status(submitRes.status).json({
          error: submitData.error?.message || submitData.message || '提交任务失败',
          raw: submitData,
        });
        return;
      }

      let taskId = '';
      if (Array.isArray(submitData?.data) && submitData.data.length > 0 && submitData.data[0].task_id) {
        taskId = submitData.data[0].task_id;
      } else if (submitData?.task_id) {
        taskId = submitData.task_id;
      }

      if (!taskId) {
        // Direct image
        res.json({ success: true, data: submitData });
        return;
      }

      // Poll until completed, max 60 attempts (90s)
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const pollRes = await fetch(`https://www.maizitech.ai/v1/tasks/${taskId}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        const pollData: any = await pollRes.json();
        const pollStatus = (pollData.status || '').toLowerCase();

        if (pollStatus === 'completed' || pollStatus === 'succeeded' || pollStatus === 'success') {
          res.json({ success: true, data: pollData, taskId });
          return;
        }
        if (pollStatus === 'failed' || pollStatus === 'violation') {
          res.status(400).json({
            error: pollData.error?.message || pollData.message || `任务执行失败 (${pollStatus})`,
            raw: pollData,
          });
          return;
        }
      }

      res.status(504).json({ error: '任务生成超时，请稍后使用 Task ID 重新查询', taskId });
    } catch (err: any) {
      console.error('Error in /api/image-modify:', err);
      res.status(500).json({ error: err.message || '图片生成服务发生内部错误' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
