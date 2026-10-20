export const MANDATORY_SPEC_TEXT =
  '不要更改商品背景，保持原图背景完全一致，强制生成条件：图片尺寸必须为 1340px*1785px (3:4 竖版高分辨率电商服装主图比例)，主体与印花清晰';

export const PROMPT_WHITE = `衣服变成白色 印花不能是白色 图片logo和衣服洗水唛扣掉，不要更改商品背景，${MANDATORY_SPEC_TEXT}`;
export const PROMPT_BLACK = `衣服变成黑色 印花不能是黑色 图片logo和衣服洗水唛扣掉，不要更改商品背景，${MANDATORY_SPEC_TEXT}`;
export const PROMPT_APRICOT = `衣服变成杏色 印花不能是杏色 图片logo和衣服洗水唛扣掉，不要更改商品背景，${MANDATORY_SPEC_TEXT}`;
export const PROMPT_GREEN = `衣服变成绿色 印花不能是绿色 图片logo和衣服洗水唛扣掉，不要更改商品背景，${MANDATORY_SPEC_TEXT}`;

export const DEFAULT_PROMPT = PROMPT_WHITE;

export const PROMPT_PRESETS = [
  {
    title: '换白去标 (白色款·保背景·1340px*1785px)',
    prompt: PROMPT_WHITE,
  },
  {
    title: '换黑去标 (黑色款·保背景·1340px*1785px)',
    prompt: PROMPT_BLACK,
  },
  {
    title: '换杏去标 (杏色款·保背景·1340px*1785px)',
    prompt: PROMPT_APRICOT,
  },
  {
    title: '换绿去标 (绿色款·保背景·1340px*1785px)',
    prompt: PROMPT_GREEN,
  },
  {
    title: '保背景去杂质',
    prompt: `主体衣服保持完整，去除背景多余阴影杂质，不要更改商品背景，保留原图背景风格，${MANDATORY_SPEC_TEXT}`,
  },
  {
    title: '去除水印与洗水唛',
    prompt: `去除图片上的所有文字、水印、Logo和衣服上的洗水唛，不要更改商品背景，保留主体、原图背景及图案细节，${MANDATORY_SPEC_TEXT}`,
  },
  {
    title: '保留印花换浅灰',
    prompt: `衣服面料颜色调整为浅灰色，不要更改商品背景，保留原图背景与原始印花图案织物细节不变，${MANDATORY_SPEC_TEXT}`,
  },
];

export const MODEL_OPTIONS = [
  { value: 'gpt-image-2.5', label: 'gpt-image-2.5 (默认主模型 · 高清商用摄影 · 1K)' },
  { value: 'gpt-image-2.5-sunburst-t', label: 'gpt-image-2.5-sunburst-t (2K超清摄影)' },
  { value: 'nano-banana-2', label: 'nano-banana-2 (极速高精)' },
  { value: 'nano-banana-2-lite', label: 'nano-banana-2-lite (轻量快速)' },
  { value: 'gpt-image-2', label: 'gpt-image-2 (商用高清摄影)' },
];

export const SIZE_OPTIONS = [
  { value: '3:4', label: '3:4 (1340px*1785px 电商服装主图 · 强制推荐)' },
  { value: '1:1', label: '1:1 (正方形)' },
  { value: '4:3', label: '4:3 (横向标准)' },
  { value: '9:16', label: '9:16 (手机竖屏)' },
  { value: '16:9', label: '16:9 (横屏大图)' },
];

export const RESOLUTION_OPTIONS = [
  { value: '1K', label: '1K (标准清晰)' },
  { value: '2K', label: '2K (高清细节)' },
];
