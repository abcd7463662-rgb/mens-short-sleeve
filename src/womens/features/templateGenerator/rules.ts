import {
  CellRule,
  TemplateMappingConfig,
  ColumnMappingConfig,
  SpuAttributeRule,
  SkuSizeItem,
} from './types';
import { cleanChineseTitle, cleanEnglishTitle, truncateTitle } from '../../utils/titleCleaner';
import { cleanImageUrlForMerchant } from '../../utils/urlCleaner';

/**
 * 生成以 018 开头的 14 位随机数字 (例: 01893821049281)
 */
export function generate018SpuCode(): string {
  let code = '018';
  for (let i = 0; i < 11; i++) {
    code += Math.floor(Math.random() * 10).toString();
  }
  return code;
}

export const DEFAULT_018_SPU_CODE = '01893821049281';

/**
 * 预设的「生成模板」第 6 行（SPU规格）写入规则配置
 */
export const TEMPLATE_ROW6_RULES: CellRule[] = [
  // 1. 基础与产地属性
  { cell: 'A6', column: 'A', value: 'spu', category: '基础属性' },
  { cell: 'B6', column: 'B', value: DEFAULT_018_SPU_CODE, category: 'SPU编号(018开头14位)' },
  { cell: 'E6', column: 'E', value: '中国大陆', category: '产地信息' },
  { cell: 'F6', column: 'F', value: '广东省', category: '产地信息' },
  { cell: 'G6', column: 'G', value: '中国大陆', category: '产地信息' },

  // 2. 材质面料成分
  { cell: 'Q6', column: 'Q', value: '有机棉混纺', category: '面料成分' },

  // 3. 面料成分（AB6 ~ AE6）
  { cell: 'AB6', column: 'AB', value: '聚酯纤维(涤纶)Polyester', category: '面料成分' },
  { cell: 'AC6', column: 'AC', value: '65%', category: '面料成分含量' },
  { cell: 'AD6', column: 'AD', value: '棉Cotton', category: '面料成分' },
  { cell: 'AE6', column: 'AE', value: '35%', category: '面料成分含量' },

  // 4. 风格与洗涤养护（AL6, AM6）及规格适用与工艺（AN6 ~ AY6）
  { cell: 'AL6', column: 'AL', value: '优雅', category: '风格' },
  { cell: 'AM6', column: 'AM', value: '数码印花类可机洗且不可干洗', category: '洗涤养护' },
  { cell: 'AN6', column: 'AN', value: 'ALL/全球/所有', category: '适用地区' },
  { cell: 'AO6', column: 'AO', value: '微弹', category: '弹性度' },
  { cell: 'AP6', column: 'AP', value: '否', category: '透气透光' },
  { cell: 'AQ6', column: 'AQ', value: '花朵印花', category: '图案花型' },
  { cell: 'AR6', column: 'AR', value: '无', category: '款式特征' },
  { cell: 'AS6', column: 'AS', value: '定位印花', category: '印花工艺' },
  { cell: 'AT6', column: 'AT', value: '梭织', category: '织造工艺' },
  { cell: 'AU6', column: 'AU', value: '圆领', category: '领型' },
  { cell: 'AV6', column: 'AV', value: '光面', category: '面料质感' },
  { cell: 'AW6', column: 'AW', value: 180, category: '克重数值' },
  { cell: 'AX6', column: 'AX', value: 'g/㎡', category: '克重单位' },
  { cell: 'AY6', column: 'AY', value: '无里料/无内衬', category: '里料内衬' },

  // 5. 现货模式与品牌尺码（BL6, CK6, CL6, CM6: CJ6 后移至 CK6，CL6 填入 1XL，原 CL6 尺码感受后移至 CM6）
  { cell: 'BL6', column: 'BL', value: '现货款', category: '货源模式' },
  { cell: 'CK6', column: 'CK', value: 'Yang', category: '品牌/设计师' },
  { cell: 'CL6', column: 'CL', value: '1XL', category: '尺码规格' },
  { cell: 'CM6', column: 'CM', value: '偏大', category: '尺码感受' },
  { cell: 'ED6', column: 'ED', value: '2610110085206', category: '海关编码/ED' },
];

export const TEMPLATE_ROW6_RULES_MEN: CellRule[] = TEMPLATE_ROW6_RULES;
export const TEMPLATE_ROW6_RULES_WOMEN: CellRule[] = TEMPLATE_ROW6_RULES;

// 尺码与尺寸测量模板基准（6码一循环，大码体系：0XL, 1XL, 2XL, 3XL, 4XL, 5XL，保留精准 CM 测量值）
export const SIZE_CYCLE_MEN = [
  { size: '0XL', co: 48, cp: 112, cq: 76, cr: 23 },
  { size: '1XL', co: 51, cp: 122, cq: 79, cr: 23 },
  { size: '2XL', co: 53, cp: 132, cq: 82, cr: 25 },
  { size: '3XL', co: 56, cp: 142, cq: 84, cr: 25 },
  { size: '4XL', co: 58, cp: 152, cq: 87, cr: 26 },
  { size: '5XL', co: 61, cp: 162, cq: 89, cr: 27 },
];

export const SIZE_CYCLE_WOMEN = SIZE_CYCLE_MEN;

export const SIZE_CYCLE = SIZE_CYCLE_MEN;

// 支持 Row 7 ~ Row 18（双色×6码：7~12行白色，13~18行黑色）
export const SKU_ROWS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];

/**
 * 预设的「生成模板」SKU规格配置 (Row 7 - Row 18)
 */
export const TEMPLATE_SKU_RULES: CellRule[] = SKU_ROWS.flatMap((row) => {
  const cycleIndex = (row - 7) % SIZE_CYCLE.length;
  const cycleItem = SIZE_CYCLE[cycleIndex];
  const color = row >= 13 ? '黑色' : '白色';
  return [
    { cell: `A${row}`, column: 'A', value: 'sku', category: 'SKU类型' },
    { cell: `B${row}`, column: 'B', value: DEFAULT_018_SPU_CODE, category: 'SPU编号(018开头14位)' },
    { cell: `CA${row}`, column: 'CA', value: 2026, category: 'SKC年份' },
    { cell: `CB${row}`, column: 'CB', value: color, category: '颜色属性' },
    { cell: `CC${row}`, column: 'CC', value: '尺码', category: '尺码规格' },
    { cell: `CD${row}`, column: 'CD', value: '欧美尺码', category: '尺码体系' },
    { cell: `CE${row}`, column: 'CE', value: '欧美尺码常规', category: '尺码版型' },
    { cell: `CF${row}`, column: 'CF', value: cycleItem.size, category: '尺码规格' },
  ];
});

/**
 * 预设的「生成模板」尺码测量规格数据 (Row 7 - Row 18: CG, CH, CI, CJ 列，填入 CM 数值)
 */
export const TEMPLATE_MEASUREMENT_RULES: CellRule[] = SKU_ROWS.flatMap((row) => {
  const cycleIndex = (row - 7) % SIZE_CYCLE.length;
  const cycleItem = SIZE_CYCLE[cycleIndex];
  return [
    { cell: `CG${row}`, column: 'CG', value: cycleItem.co, category: '尺码测量/肩宽(cm)' },
    { cell: `CH${row}`, column: 'CH', value: cycleItem.cp, category: '尺码测量/胸围(cm)' },
    { cell: `CI${row}`, column: 'CI', value: cycleItem.cq, category: '尺码测量/衣长(cm)' },
    { cell: `CJ${row}`, column: 'CJ', value: cycleItem.cr, category: '尺码测量/袖长(cm)' },
  ];
});

/**
 * 预设的「生成模板」价格、币种与海外发货仓库存规格 (Row 7 - Row 16: CO 到 CX 列 - 从 CO 列往前填入)
 */
export const TEMPLATE_PRICE_INVENTORY_RULES: CellRule[] = SKU_ROWS.flatMap((row) => {
  return [
    { cell: `CO${row}`, column: 'CO', value: 45, category: '供货价格' },
    { cell: `CP${row}`, column: 'CP', value: 'CNY', category: '币种' },
    { cell: `CQ${row}`, column: 'CQ', value: 'NJ发货仓', category: '发货仓/NJ' },
    { cell: `CR${row}`, column: 'CR', value: 9999, category: '库存/NJ' },
    { cell: `CS${row}`, column: 'CS', value: 'GA发货仓', category: '发货仓/GA' },
    { cell: `CT${row}`, column: 'CT', value: 9999, category: '库存/GA' },
    { cell: `CU${row}`, column: 'CU', value: 'FL发货仓', category: '发货仓/FL' },
    { cell: `CV${row}`, column: 'CV', value: 9999, category: '库存/FL' },
    { cell: `CW${row}`, column: 'CW', value: 'CA发货仓', category: '发货仓/CA' },
    { cell: `CX${row}`, column: 'CX', value: 9999, category: '库存/CA' },
  ];
});

/**
 * 预设的「生成模板」包裹尺寸与重量规格 (Row 7 - Row 16: DO, DP, DQ, DR 列 - 从 DO 列依次排列)
 */
export const TEMPLATE_PACKAGE_RULES: CellRule[] = SKU_ROWS.flatMap((row) => {
  return [
    { cell: `DO${row}`, column: 'DO', value: 35, category: '包装尺寸/长' },
    { cell: `DP${row}`, column: 'DP', value: 21, category: '包装尺寸/宽' },
    { cell: `DQ${row}`, column: 'DQ', value: 1, category: '包装尺寸/高' },
    { cell: `DR${row}`, column: 'DR', value: 180, category: '包装重量/克' },
  ];
});

export const DEFAULT_WHITE_EXTRA_IMAGES = {
  dt: 'https://img.kwcdn.com/product/open/e8e12a3e2fb14682a0eebf11a561fe3d-goods.jpeg',
  du: 'https://img.kwcdn.com/product/open/71a18a9a2b784616b24311783aa60e71-goods.jpeg',
  dv: 'https://img.kwcdn.com/product/open/75552aa23d514f20945851ad045fbdfc-goods.jpeg',
  dw: 'https://img.kwcdn.com/product/open/62ad8c3951d641dcb8717a532d875a96-goods.jpeg',
};

export const DEFAULT_BLACK_EXTRA_IMAGES = {
  dt: 'https://img.kwcdn.com/product/open/d3cf890b8a5b497680396492630006a0-goods.jpeg',
  du: 'https://img.kwcdn.com/product/open/e297987d009742399e77e6fee09197f0-goods.jpeg',
  dv: 'https://img.kwcdn.com/product/open/b2ff0cd7a9254b0b926a075e84fb9d12-goods.jpeg',
  dw: 'https://img.kwcdn.com/product/open/da5675724f5f457087d2a15349f82681-goods.jpeg',
};

/**
 * 预设的「生成模板」商品副图规格 (Row 7 - Row 18: DT, DU, DV, DW 列)
 */
export const TEMPLATE_EXTRA_IMAGE_RULES: CellRule[] = SKU_ROWS.flatMap((row) => {
  const isBlack = row >= 13;
  const imgs = isBlack ? DEFAULT_BLACK_EXTRA_IMAGES : DEFAULT_WHITE_EXTRA_IMAGES;
  return [
    { cell: `DT${row}`, column: 'DT', value: imgs.dt, category: '商品附图/DT' },
    { cell: `DU${row}`, column: 'DU', value: imgs.du, category: '商品附图/DU' },
    { cell: `DV${row}`, column: 'DV', value: imgs.dv, category: '商品附图/DV' },
    { cell: `DW${row}`, column: 'DW', value: imgs.dw, category: '商品附图/DW' },
  ];
});

/**
 * 汇总默认规则：包含所有行（第 6 行 SPU、第 7-18 行 SKU共两组、尺码测量、价格与海外仓库存、包裹规格、商品副图）的指定字段规则
 */
export const TEMPLATE_ROW7_16_RULES: CellRule[] = [
  ...TEMPLATE_SKU_RULES,
  ...TEMPLATE_MEASUREMENT_RULES,
  ...TEMPLATE_PRICE_INVENTORY_RULES,
  ...TEMPLATE_PACKAGE_RULES,
  ...TEMPLATE_EXTRA_IMAGE_RULES,
];

export const TEMPLATE_RULES: CellRule[] = [
  ...TEMPLATE_ROW6_RULES,
  ...TEMPLATE_ROW7_16_RULES,
];


export type ColorKey = 'white' | 'black';

export const COLOR_NAMES: Record<ColorKey, string> = {
  white: '白色',
  black: '黑色',
};

export interface ProductTemplateInput {
  title: string;
  englishTitle?: string;
  spuCode?: string; // 可选指定或自动生成以 018 开头的 14 位 SPU 随机编号
  whiteImageUrl?: string;
  blackImageUrl?: string;
  whiteExtraImages?: { dt?: string; du?: string; dv?: string; dw?: string };
  blackExtraImages?: { dt?: string; du?: string; dv?: string; dw?: string };
  firstColor?: ColorKey; // 首选颜色（写入 SPU EA 列）
  colorOrder?: ColorKey[]; // 颜色先后顺序
  useLocalCPath?: boolean; // 是否使用 C 盘本地下载路径模式
  localCFolderPath?: string; // C 盘文件夹路径，默认 C:\Users\Tnsk\Downloads\
  unzipFolderName?: string; // 解压后的文件夹名称，默认 "商品图片包"
  pathFormat?: 'windows' | 'fileUrl' | 'encodedFileUrl'; // 路径格式
}

/**
 * 格式化本地图片全路径，支持 Windows 标准盘符路径、file:/// 协议路径以及 URL 编码后的 file:/// 路径
 */
export function formatLocalPath(
  baseFolderPath: string,
  unzipFolder: string,
  filename: string,
  pathFormat: 'windows' | 'fileUrl' | 'encodedFileUrl' = 'windows'
): string {
  let cleanBase = (baseFolderPath || 'C:\\Users\\Tnsk\\Downloads\\').trim();
  const cleanUnzip = unzipFolder.trim() ? unzipFolder.trim() : '商品图片包';

  const isFileProtocolInput = cleanBase.startsWith('file:///');
  const targetFormat = isFileProtocolInput && pathFormat === 'windows' ? 'fileUrl' : pathFormat;

  if (targetFormat === 'fileUrl' || targetFormat === 'encodedFileUrl' || isFileProtocolInput) {
    cleanBase = cleanBase.replace(/^file:\/*/, '').replace(/\\/g, '/');
    if (!cleanBase.endsWith('/')) {
      cleanBase += '/';
    }
    const fullPath = `file:///${cleanBase}${cleanUnzip}/${filename}`;
    if (targetFormat === 'encodedFileUrl') {
      return encodeURI(fullPath);
    }
    return fullPath;
  }

  // Windows 标准盘符路径 (如 C:\Users\Tnsk\Downloads\商品图片包\文件名.jpg)
  cleanBase = cleanBase.replace(/\//g, '\\');
  if (!cleanBase.endsWith('\\')) {
    cleanBase += '\\';
  }
  return `${cleanBase}${cleanUnzip}\\${filename}`.replace(/\//g, '\\');
}

/**
 * 构建多商品整合的完整模板写入规则：
 * - 每个商品包含 1 行 SPU + 2 种颜色(白色、黑色)的 SKU（每种颜色 6 码：L, XL, XXL, XXXL, XXXXL, XXXXXL）
 *   - 支持双色：白色、黑色
 *   - SPU 行: C 填中文标题，D 填谷歌翻译英文标题，EA 填入排在首位的颜色图片链接
 *   - SKU 行: 每种颜色 6 行，C 填标题，D 填英文标题，CB 填颜色名称，EA 填该颜色图片链接
 * - 同一个表格往下增加，支持多商品连续追加
 */
export function buildMultiProductTemplateRules(
  products: ProductTemplateInput[],
  _configOrGender?: any
): CellRule[] {
  if (products.length === 0) {
    return TEMPLATE_RULES;
  }

  const allRules: CellRule[] = [];
  let currentRow = 6;

  products.forEach((prod, k) => {
    const rawTitle = prod.title?.trim() || `商品_${k + 1}`;
    const pTitle = cleanChineseTitle(rawTitle) || truncateTitle(rawTitle, 250);
    const rawEnglish = prod.englishTitle?.trim() || pTitle;
    const pEnglishTitle = cleanEnglishTitle(rawEnglish) || cleanEnglishTitle(pTitle) || truncateTitle(pTitle, 250);
    const spuCode = prod.spuCode?.trim() || generate018SpuCode();

    // 确定此商品的颜色列表及其先后顺序（双色：白色、黑色）
    let colors: ColorKey[];
    if (prod.colorOrder && prod.colorOrder.length > 0) {
      colors = prod.colorOrder.filter((c): c is ColorKey => c === 'white' || c === 'black');
      if (colors.length === 0) colors = ['white', 'black'];
    } else {
      const default2: ColorKey[] = ['white', 'black'];
      if (prod.firstColor && default2.includes(prod.firstColor)) {
        const rest = default2.filter((c) => c !== prod.firstColor);
        colors = [prod.firstColor, ...rest];
      } else {
        colors = ['white', 'black'];
      }
    }

    const folderPath = prod.localCFolderPath || 'C:\\Users\\Tnsk\\Downloads\\';
    const unzipDir = prod.unzipFolderName || '商品图片包';
    const pathFormat = prod.pathFormat || (folderPath.startsWith('file:///') ? 'fileUrl' : 'windows');
    const safeTitleForFilename = (pTitle || `商品_${k + 1}`).replace(/[/\\?%*:|"<>]/g, '_');

    const getImageUrl = (c: ColorKey): string | undefined => {
      let rawUrl = '';
      switch (c) {
        case 'white':
          rawUrl = prod.whiteImageUrl?.trim() || '';
          break;
        case 'black':
          rawUrl = prod.blackImageUrl?.trim() || '';
          break;
      }

      if (prod.useLocalCPath) {
        const colorName = COLOR_NAMES[c] || c;
        if (rawUrl && (rawUrl.match(/^[a-zA-Z]:\\/) || rawUrl.match(/^[a-zA-Z]:\//) || rawUrl.startsWith('file:///'))) {
          return rawUrl;
        }
        return formatLocalPath(folderPath, unzipDir, `${safeTitleForFilename}_${colorName}_1340x1785.jpg`, pathFormat);
      }

      return cleanImageUrlForMerchant(rawUrl) || undefined;
    };

    const spuRow = currentRow;
    const firstColor = colors[0];
    const firstColorName = COLOR_NAMES[firstColor] || '首图';
    const firstImageUrl = getImageUrl(firstColor);

    // 1. SPU 行
    TEMPLATE_ROW6_RULES.forEach((r) => {
      allRules.push({
        cell: `${r.column}${spuRow}`,
        column: r.column,
        value: r.column === 'B' ? spuCode : r.value,
        numFmt: r.numFmt,
        category: `商品${k + 1} SPU ${r.category}`,
      });
    });

    // SPU 标题 (C 列)
    if (pTitle) {
      allRules.push({
        cell: `C${spuRow}`,
        column: 'C',
        value: pTitle,
        category: `商品${k + 1}标题(SPU/C列)`,
      });
    }

    // SPU 谷歌翻译英文标题 (D 列 - 重点第 6 行 D6)
    if (pEnglishTitle) {
      allRules.push({
        cell: `D${spuRow}`,
        column: 'D',
        value: pEnglishTitle,
        category: `商品${k + 1}英文标题(SPU/D列)`,
      });
    }

    // SPU 首图链接 (仅填入 DS 列，不填入 EA 列)
    if (firstImageUrl) {
      allRules.push({
        cell: `DS${spuRow}`,
        column: 'DS',
        value: firstImageUrl,
        category: `商品${k + 1}${firstColorName}款首图(SPU/DS列)`,
      });
    }

    // 2. SKU 各颜色行：每种颜色 6 行 (L, XL, XXL, XXXL, XXXXL, XXXXXL)
    let skuCurrentRow = spuRow + 1;
    colors.forEach((cKey) => {
      const colorName = COLOR_NAMES[cKey] || '标准色';
      const imageUrl = getImageUrl(cKey);

      for (let s = 0; s < SIZE_CYCLE.length; s++) {
        const row = skuCurrentRow + s;
        const cycleItem = SIZE_CYCLE[s % SIZE_CYCLE.length];

        // 商品标题填入 C 列
        allRules.push({
          cell: `C${row}`,
          column: 'C',
          value: pTitle,
          category: `商品${k + 1}中文标题(C列)`,
        });

        // 谷歌翻译英文标题填入 D 列
        allRules.push({
          cell: `D${row}`,
          column: 'D',
          value: pEnglishTitle,
          category: `商品${k + 1}英文标题(D列)`,
        });

        // SKU 基础属性与年份 (B列填入同SPU下018开头14位数字，CA~CF 列)
        allRules.push(
          { cell: `A${row}`, column: 'A', value: 'sku', category: 'SKU类型' },
          { cell: `B${row}`, column: 'B', value: spuCode, category: 'SPU编号(B列)' },
          { cell: `CA${row}`, column: 'CA', value: 2026, category: 'SKC年份' },
          { cell: `CB${row}`, column: 'CB', value: colorName, category: '颜色属性' },
          { cell: `CC${row}`, column: 'CC', value: '尺码', category: '尺码规格' },
          { cell: `CD${row}`, column: 'CD', value: '欧美尺码', category: '尺码体系' },
          { cell: `CE${row}`, column: 'CE', value: '欧美尺码常规', category: '尺码版型' },
          { cell: `CF${row}`, column: 'CF', value: cycleItem.size, category: '尺码规格' }
        );

        // 尺码测量 (CG~CJ 列)
        allRules.push(
          { cell: `CG${row}`, column: 'CG', value: cycleItem.co, category: '尺码测量' },
          { cell: `CH${row}`, column: 'CH', value: cycleItem.cp, category: '尺码测量' },
          { cell: `CI${row}`, column: 'CI', value: cycleItem.cq, category: '尺码测量' },
          { cell: `CJ${row}`, column: 'CJ', value: cycleItem.cr, category: '尺码测量' }
        );

        // 价格与海外发货仓库存 (CO~CX 列 - 从 CO 列往前填入依次排列)
        allRules.push(
          { cell: `CO${row}`, column: 'CO', value: 45, category: '供货价格' },
          { cell: `CP${row}`, column: 'CP', value: 'CNY', category: '币种' },
          { cell: `CQ${row}`, column: 'CQ', value: 'NJ发货仓', category: '发货仓/NJ' },
          { cell: `CR${row}`, column: 'CR', value: 9999, category: '库存/NJ' },
          { cell: `CS${row}`, column: 'CS', value: 'GA发货仓', category: '发货仓/GA' },
          { cell: `CT${row}`, column: 'CT', value: 9999, category: '库存/GA' },
          { cell: `CU${row}`, column: 'CU', value: 'FL发货仓', category: '发货仓/FL' },
          { cell: `CV${row}`, column: 'CV', value: 9999, category: '库存/FL' },
          { cell: `CW${row}`, column: 'CW', value: 'CA发货仓', category: '发货仓/CA' },
          { cell: `CX${row}`, column: 'CX', value: 9999, category: '库存/CA' }
        );

        // 包裹规格 (DO~DR 列 - 从 DO 列依次排列)
        allRules.push(
          { cell: `DO${row}`, column: 'DO', value: 35, category: '包装尺寸/长' },
          { cell: `DP${row}`, column: 'DP', value: 21, category: '包装尺寸/宽' },
          { cell: `DQ${row}`, column: 'DQ', value: 1, category: '包装尺寸/高' },
          { cell: `DR${row}`, column: 'DR', value: 180, category: '包装重量/克' }
        );

        // 颜色专属商品副图 (DT, DU, DV, DW 列)
        const getExtraImgs = (c: ColorKey) => {
          const colorName = COLOR_NAMES[c] || c;
          const raw = c === 'white' ? prod.whiteExtraImages || DEFAULT_WHITE_EXTRA_IMAGES : prod.blackExtraImages || DEFAULT_BLACK_EXTRA_IMAGES;
          if (prod.useLocalCPath) {
            return {
              dt: raw.dt?.match(/^([a-zA-Z]:|file:\/\/\/)/) ? raw.dt : formatLocalPath(folderPath, unzipDir, `${safeTitleForFilename}_${colorName}_DT.jpg`, pathFormat),
              du: raw.du?.match(/^([a-zA-Z]:|file:\/\/\/)/) ? raw.du : formatLocalPath(folderPath, unzipDir, `${safeTitleForFilename}_${colorName}_DU.jpg`, pathFormat),
              dv: raw.dv?.match(/^([a-zA-Z]:|file:\/\/\/)/) ? raw.dv : formatLocalPath(folderPath, unzipDir, `${safeTitleForFilename}_${colorName}_DV.jpg`, pathFormat),
              dw: raw.dw?.match(/^([a-zA-Z]:|file:\/\/\/)/) ? raw.dw : formatLocalPath(folderPath, unzipDir, `${safeTitleForFilename}_${colorName}_DW.jpg`, pathFormat),
            };
          }
          return {
            dt: cleanImageUrlForMerchant(raw.dt),
            du: cleanImageUrlForMerchant(raw.du),
            dv: cleanImageUrlForMerchant(raw.dv),
            dw: cleanImageUrlForMerchant(raw.dw),
          };
        };
        const extraImgs = getExtraImgs(cKey);
        if (extraImgs) {
          if (extraImgs.dt) allRules.push({ cell: `DT${row}`, column: 'DT', value: extraImgs.dt, category: `商品${k + 1}${colorName}附图(DT)` });
          if (extraImgs.du) allRules.push({ cell: `DU${row}`, column: 'DU', value: extraImgs.du, category: `商品${k + 1}${colorName}附图(DU)` });
          if (extraImgs.dv) allRules.push({ cell: `DV${row}`, column: 'DV', value: extraImgs.dv, category: `商品${k + 1}${colorName}附图(DV)` });
          if (extraImgs.dw) allRules.push({ cell: `DW${row}`, column: 'DW', value: extraImgs.dw, category: `商品${k + 1}${colorName}附图(DW)` });
        }

        // 图片直链仅写入 DS 列，不写入 EA 列
        if (imageUrl) {
          allRules.push({
            cell: `DS${row}`,
            column: 'DS',
            value: imageUrl,
            category: `商品${k + 1}${colorName}款主图(DS列)`,
          });
        }
      }

      skuCurrentRow += SIZE_CYCLE.length;
    });

    currentRow = skuCurrentRow;
  });

  return allRules;
}

/**
 * 构建针对单个商品实例的模板写入规则（兼容原有单商品模式）
 */
export function buildProductTemplateRules(
  productTitle?: string,
  whiteImageUrl?: string,
  blackImageUrl?: string,
  englishTitle?: string,
  firstColor?: ColorKey,
  colorOrder?: ColorKey[]
): CellRule[] {
  return buildMultiProductTemplateRules([
    {
      title: productTitle || '',
      englishTitle,
      whiteImageUrl,
      blackImageUrl,
      firstColor,
      colorOrder,
    },
  ]);
}

/**
 * 列映射与模板自定义配置基准
 */
export const DEFAULT_COLUMN_MAPPING: ColumnMappingConfig = {
  titleCol: 'C',
  whiteImageCol: 'DS',
  blackImageCol: 'DS',
  writeSpuImage: true,
  spuImageCol: 'DS',
  imageDsCol: 'DS',

  skuTypeCol: 'A',
  spuTypeCol: 'A',
  yearCol: 'B',
  skcYearCol: 'CA',
  colorCol: 'CB',
  sizeTypeCol: 'CC',
  sizeSystemCol: 'CD',
  sizeVersionCol: 'CE',
  sizeNameCol: 'CF',

  measureShoulderCol: 'CG',
  measureBustCol: 'CH',
  measureLengthCol: 'CI',
  measureSleeveCol: 'CJ',

  priceCol: 'CO',
  currencyCol: 'CP',
  defaultPrice: 45,
  defaultCurrency: 'CNY',

  warehouseNJCol: 'CQ',
  stockNJCol: 'CR',
  warehouseGACol: 'CS',
  stockGACol: 'CT',
  warehouseFLCol: 'CU',
  stockFLCol: 'CV',
  warehouseCACol: 'CW',
  stockCACol: 'CX',
  defaultStock: 9999,

  packageLengthCol: 'DO',
  packageWidthCol: 'DP',
  packageHeightCol: 'DQ',
  packageWeightCol: 'DR',
  defaultPkgL: 35,
  defaultPkgW: 21,
  defaultPkgH: 1,
  defaultPkgWeight: 180,

  imageDtCol: 'DT',
  imageDuCol: 'DU',
  imageDvCol: 'DV',
  imageDwCol: 'DW',
};

export const DEFAULT_SPU_RULES: SpuAttributeRule[] = TEMPLATE_ROW6_RULES.map((r, i) => ({
  id: `spu_rule_${i + 1}`,
  column: r.column,
  value: r.value,
  category: r.category,
  enabled: true,
}));

export const DEFAULT_SIZE_MATRIX: SkuSizeItem[] = SIZE_CYCLE_MEN.map((s) => ({
  size: s.size,
  co: s.co,
  cp: s.cp,
  cq: s.cq,
  cr: s.cr,
  price: 45,
  pkgWeight: 180,
}));

export const DEFAULT_TEMPLATE_CONFIG: TemplateMappingConfig = {
  presetName: '跨境爆款男装T恤标准模板',
  targetSheetIndex: -1,
  spuStartRow: 6,
  whiteSkuCount: 5,
  blackSkuCount: 5,
  columns: DEFAULT_COLUMN_MAPPING,
  spuRules: DEFAULT_SPU_RULES,
  sizeMatrix: DEFAULT_SIZE_MATRIX,
};

const STORAGE_KEY_TEMPLATE_CONFIG = 'TEMPLATE_MAPPING_CONFIG_V24';

export function loadSavedTemplateConfig(): TemplateMappingConfig {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY_TEMPLATE_CONFIG) : null;
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Failed to load template config', e);
  }
  return DEFAULT_TEMPLATE_CONFIG;
}

export function saveTemplateConfig(cfg: TemplateMappingConfig): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_TEMPLATE_CONFIG, JSON.stringify(cfg));
    }
  } catch (e) {
    console.error('Failed to save template config', e);
  }
}

export function resetTemplateConfigToDefault(): TemplateMappingConfig {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY_TEMPLATE_CONFIG);
    }
  } catch (e) {
    console.error('Failed to reset template config', e);
  }
  return DEFAULT_TEMPLATE_CONFIG;
}



