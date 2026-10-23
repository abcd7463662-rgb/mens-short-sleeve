import {
  CellRule,
  TemplateMappingConfig,
  ColumnMappingConfig,
  SpuAttributeRule,
  SkuSizeItem,
} from './types';
import { cleanChineseTitle, cleanEnglishTitle, truncateTitle } from '../../utils/titleCleaner';

/**
 * 预设的「生成模板」第 6 行（SPU规格）写入规则配置
 */
export const TEMPLATE_ROW6_RULES: CellRule[] = [
  // 1. 基础与产地属性
  { cell: 'A6', column: 'A', value: 'spu', category: '基础属性' },
  { cell: 'B6', column: 'B', value: 2026, category: '基础属性' },
  { cell: 'E6', column: 'E', value: '中国大陆', category: '产地信息' },
  { cell: 'F6', column: 'F', value: '广东省', category: '产地信息' },
  { cell: 'G6', column: 'G', value: '中国大陆', category: '产地信息' },

  // 2. 材质面料成分 (100%纯棉/有机棉)
  { cell: 'Q6', column: 'Q', value: '有机棉', category: '面料成分' },
  { cell: 'R6', column: 'R', value: '棉', category: '材质属性' },
  { cell: 'S6', column: 'S', value: '100%', category: '成分含量' },

  // 3. 款式风格、洗护与销售范围
  { cell: 'AB6', column: 'AB', value: '数码印花类可机洗且不可干洗', category: '洗涤养护' },
  { cell: 'AC6', column: 'AC', value: 'ALL/全球/所有', category: '销售区域' },
  { cell: 'AD6', column: 'AD', value: '圆领', category: '领型特征' },
  { cell: 'AE6', column: 'AE', value: '微弹', category: '弹力属性' },
  { cell: 'AF6', column: 'AF', value: '半透', category: '透气透光' },
  { cell: 'AG6', column: 'AG', value: '表情符号', category: '图案元素' },
  { cell: 'AH6', column: 'AH', value: '无', category: '附加属性' },
  { cell: 'AI6', column: 'AI', value: '成人', category: '适用人群' },
  { cell: 'AP6', column: 'AP', value: '运动', category: '风格分类' },
  { cell: 'AZ6', column: 'AZ', value: '运动', category: '适用场景' },

  // 4. 版型工艺、面料与克重内衬
  { cell: 'BJ6', column: 'BJ', value: '宽松', category: '版型风格' },
  { cell: 'BK6', column: 'BK', value: '梭织', category: '织造工艺' },
  { cell: 'BL6', column: 'BL', value: '定位印花', category: '印花工艺' },
  { cell: 'BM6', column: 'BM', value: '光面', category: '面料质感' },
  { cell: 'BN6', column: 'BN', value: 180, category: '克重数值' },
  { cell: 'BO6', column: 'BO', value: 'g/㎡', category: '克重单位' },
  { cell: 'BP6', column: 'BP', value: '无里料/无内衬', category: '里料内衬' },

  // 5. 品牌尺码与试穿感受
  { cell: 'EN6', column: 'EN', value: 'Julian Vance', category: '品牌/设计师' },
  { cell: 'EO6', column: 'EO', value: 'M', category: '试穿尺码' },
  { cell: 'EP6', column: 'EP', value: '偏大', category: '尺码感受' },
];

export const TEMPLATE_ROW6_RULES_MEN: CellRule[] = TEMPLATE_ROW6_RULES;
export const TEMPLATE_ROW6_RULES_WOMEN: CellRule[] = TEMPLATE_ROW6_RULES;

// 尺码与尺寸测量模板基准（5行一循环：S, M, L, XL, XXL）
export const SIZE_CYCLE_MEN = [
  { size: 'S', co: 43, cp: 92, cq: 71, cr: 22 },
  { size: 'M', co: 45, cp: 102, cq: 74, cr: 22 },
  { size: 'L', co: 48, cp: 112, cq: 76, cr: 23 },
  { size: 'XL', co: 51, cp: 122, cq: 79, cr: 23 },
  { size: 'XXL', co: 53, cp: 132, cq: 82, cr: 25 },
];

export const SIZE_CYCLE_WOMEN = [
  { size: 'S', co: 41, cp: 88, cq: 68, cr: 20 },
  { size: 'M', co: 43, cp: 94, cq: 70, cr: 20 },
  { size: 'L', co: 45, cp: 100, cq: 72, cr: 21 },
  { size: 'XL', co: 47, cp: 106, cq: 74, cr: 21 },
  { size: 'XXL', co: 49, cp: 112, cq: 76, cr: 22 },
];

export const SIZE_CYCLE = SIZE_CYCLE_MEN;

// 支持 Row 7 ~ Row 16（共两轮复制填充：7~11行 与 12~16行）
export const SKU_ROWS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16];

/**
 * 预设的「生成模板」SKU规格配置 (Row 7 - Row 16: A, B, ED, EE, EF, EG, EH, EI 列)
 */
export const TEMPLATE_SKU_RULES: CellRule[] = SKU_ROWS.flatMap((row) => {
  const cycleItem = SIZE_CYCLE[(row - 7) % SIZE_CYCLE.length];
  const color = row >= 12 ? '黑色' : '白色';
  return [
    { cell: `A${row}`, column: 'A', value: 'sku', category: 'SKU类型' },
    { cell: `B${row}`, column: 'B', value: 2026, category: '年份属性' },
    { cell: `ED${row}`, column: 'ED', value: 2026, category: 'SKC年份' },
    { cell: `EE${row}`, column: 'EE', value: color, category: '颜色属性' },
    { cell: `EF${row}`, column: 'EF', value: '尺码', category: '尺码规格' },
    { cell: `EG${row}`, column: 'EG', value: '欧美尺码', category: '尺码体系' },
    { cell: `EH${row}`, column: 'EH', value: '欧美尺码常规', category: '尺码版型' },
    { cell: `EI${row}`, column: 'EI', value: cycleItem.size, category: '尺码规格' },
  ];
});

/**
 * 预设的「生成模板」尺码测量规格数据 (Row 7 - Row 16: EJ, EK, EL, EM 列)
 */
export const TEMPLATE_MEASUREMENT_RULES: CellRule[] = SKU_ROWS.flatMap((row) => {
  const cycleItem = SIZE_CYCLE[(row - 7) % SIZE_CYCLE.length];
  return [
    { cell: `EJ${row}`, column: 'EJ', value: cycleItem.co, category: '尺码测量' },
    { cell: `EK${row}`, column: 'EK', value: cycleItem.cp, category: '尺码测量' },
    { cell: `EL${row}`, column: 'EL', value: cycleItem.cq, category: '尺码测量' },
    { cell: `EM${row}`, column: 'EM', value: cycleItem.cr, category: '尺码测量' },
  ];
});

/**
 * 预设的「生成模板」价格、币种与海外发货仓库存规格 (Row 7 - Row 16: ER 到 FA 列)
 */
export const TEMPLATE_PRICE_INVENTORY_RULES: CellRule[] = SKU_ROWS.flatMap((row) => {
  return [
    { cell: `ER${row}`, column: 'ER', value: 45, category: '供货价格' },
    { cell: `ES${row}`, column: 'ES', value: 'CNY', category: '币种' },
    { cell: `ET${row}`, column: 'ET', value: 'NJ发货仓', category: '发货仓/NJ' },
    { cell: `EU${row}`, column: 'EU', value: 9999, category: '库存/NJ' },
    { cell: `EV${row}`, column: 'EV', value: 'GA发货仓', category: '发货仓/GA' },
    { cell: `EW${row}`, column: 'EW', value: 9999, category: '库存/GA' },
    { cell: `EX${row}`, column: 'EX', value: 'FL发货仓', category: '发货仓/FL' },
    { cell: `EY${row}`, column: 'EY', value: 9999, category: '库存/FL' },
    { cell: `EZ${row}`, column: 'EZ', value: 'CA发货仓', category: '发货仓/CA' },
    { cell: `FA${row}`, column: 'FA', value: 9999, category: '库存/CA' },
  ];
});

/**
 * 预设的「生成模板」包裹尺寸与重量规格 (Row 7 - Row 16: FR, FS, FT, FU 列)
 */
export const TEMPLATE_PACKAGE_RULES: CellRule[] = SKU_ROWS.flatMap((row) => {
  return [
    { cell: `FR${row}`, column: 'FR', value: 35, category: '包装尺寸/长' },
    { cell: `FS${row}`, column: 'FS', value: 21, category: '包装尺寸/宽' },
    { cell: `FT${row}`, column: 'FT', value: 1, category: '包装尺寸/高' },
    { cell: `FU${row}`, column: 'FU', value: 180, category: '包装重量/克' },
  ];
});

/**
 * 汇总默认规则：包含所有行（第 6 行 SPU、第 7-16 行 SKU共两组、尺码测量、价格与海外仓库存、包裹规格）的指定字段规则
 */
export const TEMPLATE_ROW7_16_RULES: CellRule[] = [
  ...TEMPLATE_SKU_RULES,
  ...TEMPLATE_MEASUREMENT_RULES,
  ...TEMPLATE_PRICE_INVENTORY_RULES,
  ...TEMPLATE_PACKAGE_RULES,
];

export const TEMPLATE_RULES: CellRule[] = [
  ...TEMPLATE_ROW6_RULES,
  ...TEMPLATE_ROW7_16_RULES,
];


export type ColorKey = 'black' | 'white';

export const COLOR_NAMES: Record<ColorKey, string> = {
  black: '黑色',
  white: '白色',
};

export type ColorMode = 'black' | 'white' | 'both';

export interface ProductTemplateInput {
  title: string;
  englishTitle?: string;
  whiteImageUrl?: string;
  blackImageUrl?: string;
  selectedColor?: ColorMode; // 'black' | 'white' | 'both'，默认 'black'
  firstColor?: ColorKey; // 首选颜色（写入 SPU EA 列）
  colorOrder?: ColorKey[]; // 颜色先后顺序
}

/**
 * 生成 SPU 编码：固定前缀 017 + 9 位随机数字，共 12 位。
 * 以字符串写入 B 列，Excel 不会吞掉前导 0。
 */
export function generateSpuCode(): string {
  let digits = '';
  for (let i = 0; i < 9; i++) {
    digits += Math.floor(Math.random() * 10).toString();
  }
  return `017${digits}`;
}

/**
 * 为同一次导出生成互不重复的 SPU 编码，避免随机碰撞
 */
function generateUniqueSpuCodes(count: number): string[] {
  const used = new Set<string>();
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    let code = generateSpuCode();
    while (used.has(code)) code = generateSpuCode();
    used.add(code);
    codes.push(code);
  }
  return codes;
}

/**
 * 构建多商品整合的完整模板写入规则：
 * - 仅针对黑色与白色衣服（默认填入黑色）
 * - 支持选择：填入黑色（1行SPU + 5行黑色SKU）、填入白色（1行SPU + 5行白色SKU）、或黑白双色（1行SPU + 10行SKU）
 * - SPU 行: C 填中文标题，D 填谷歌翻译英文标题，EA 填入排在首位的颜色图片链接
 * - SKU 行: 每种颜色 5 行 (S, M, L, XL, XXL)，C 填标题，D 填英文标题，CJ 填颜色名称（黑色/白色），EA 填该颜色图片链接
 * - 同一个表格往下增加，支持多商品连续追加
 */
export function buildMultiProductTemplateRules(
  products: ProductTemplateInput[],
  defaultColorModeOrConfig?: ColorMode | any
): CellRule[] {
  if (products.length === 0) {
    return TEMPLATE_RULES;
  }

  const effectiveDefaultColor: ColorMode =
    typeof defaultColorModeOrConfig === 'string' &&
    (defaultColorModeOrConfig === 'black' || defaultColorModeOrConfig === 'white' || defaultColorModeOrConfig === 'both')
      ? defaultColorModeOrConfig
      : 'black';

  const allRules: CellRule[] = [];
  let currentRow = 6;
  const spuCodes = generateUniqueSpuCodes(products.length);

  products.forEach((prod, k) => {
    const spuCode = spuCodes[k];
    const rawTitle = prod.title?.trim() || `商品_${k + 1}`;
    const pTitle = cleanChineseTitle(rawTitle) || truncateTitle(rawTitle, 250);
    const pEnglishTitle = prod.englishTitle?.trim() || pTitle;

    // 确定此商品的颜色列表及其先后顺序（仅支持黑色和白色，默认黑色）
    let colors: ColorKey[];
    const colorMode: ColorMode = prod.selectedColor || effectiveDefaultColor;

    if (prod.colorOrder && prod.colorOrder.length > 0) {
      colors = [...prod.colorOrder].filter((c) => c === 'black' || c === 'white');
      if (colors.length === 0) colors = [colorMode === 'white' ? 'white' : 'black'];
    } else if (colorMode === 'white') {
      colors = ['white'];
    } else if (colorMode === 'both') {
      colors = prod.firstColor === 'white' ? ['white', 'black'] : ['black', 'white'];
    } else {
      // 默认黑色
      colors = ['black'];
    }

    const getImageUrl = (c: ColorKey): string | undefined => {
      if (c === 'black') {
        return prod.blackImageUrl?.trim() || prod.whiteImageUrl?.trim();
      }
      return prod.whiteImageUrl?.trim() || prod.blackImageUrl?.trim();
    };

    const spuRow = currentRow;
    const firstColor = colors[0] || 'black';
    const firstColorName = COLOR_NAMES[firstColor] || '黑色';
    const firstImageUrl = getImageUrl(firstColor);
    const whiteExtraImages = [
      'https://img.kwcdn.com/product/open/7c8fd3b010b249b6ad9bd9f5e4cd93df-goods.jpeg?imageView2/2/w/800/q/70/format/avif',
      'https://img.kwcdn.com/product/open/3483dde9f0ab430f86ed29b47e116a41-goods.jpeg?imageView2/2/w/800/q/70/format/avif',
      'https://img.kwcdn.com/product/open/19e5dc66ae634612a8a3c92022476e92-goods.jpeg?imageView2/2/w/800/q/70/format/avif',
    ];
    const blackExtraImages = [
      'https://img.kwcdn.com/product/open/e297987d009742399e77e6fee09197f0-goods.jpeg',
      'https://img.kwcdn.com/product/open/b2ff0cd7a9254b0b926a075e84fb9d12-goods.jpeg',
      'https://img.kwcdn.com/product/open/da5675724f5f457087d2a15349f82681-goods.jpeg',
    ];
    const firstExtraImages = firstColor === 'white' ? whiteExtraImages : blackExtraImages;

    // 1. SPU 行（B 列改为每个 SPU 独立的 017 编码，替换默认年份值）
    TEMPLATE_ROW6_RULES.forEach((r) => {
      if (r.column === 'B') return;
      allRules.push({
        cell: `${r.column}${spuRow}`,
        column: r.column,
        value: r.value,
        category: `商品${k + 1} SPU ${r.category}`,
      });
    });
    allRules.push({
      cell: `B${spuRow}`,
      column: 'B',
      value: spuCode,
      category: `商品${k + 1} SPU 编码(B列)`,
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

    // SPU 首图链接 (FV 列 - 对应第一顺位颜色的图片)
    if (firstImageUrl) {
      allRules.push({
        cell: `FV${spuRow}`,
        column: 'FV',
        value: firstImageUrl,
        category: `商品${k + 1}${firstColorName}款首图(SPU/FV列)`,
      });
    }

    // 新增: 图片直链写入 FW, FX, FY (SPU 行)
    allRules.push({
      cell: `FW${spuRow}`,
      column: 'FW',
      value: firstExtraImages[0],
      category: `商品${k + 1}图片(FW列)`,
    });
    allRules.push({
      cell: `FX${spuRow}`,
      column: 'FX',
      value: firstExtraImages[1],
      category: `商品${k + 1}图片(FX列)`,
    });
    allRules.push({
      cell: `FY${spuRow}`,
      column: 'FY',
      value: firstExtraImages[2],
      category: `商品${k + 1}图片(FY列)`,
    });

    // 2. SKU 各颜色行：每种颜色 5 行 (5 码)
    let skuCurrentRow = spuRow + 1;
    colors.forEach((cKey) => {
      const colorName = COLOR_NAMES[cKey] || '标准色';
      const imageUrl = getImageUrl(cKey);
      const extraImages = cKey === 'white' ? whiteExtraImages : blackExtraImages;

      for (let s = 0; s < 5; s++) {
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

        // SKU 基础属性与年份（B 列沿用所属 SPU 的编码）
        allRules.push(
          { cell: `A${row}`, column: 'A', value: 'sku', category: 'SKU类型' },
          { cell: `B${row}`, column: 'B', value: spuCode, category: 'SPU编码(B列)' },
          { cell: `ED${row}`, column: 'ED', value: 2026, category: 'SKC年份' },
          { cell: `EE${row}`, column: 'EE', value: colorName, category: '颜色属性' },
          { cell: `EF${row}`, column: 'EF', value: '尺码', category: '尺码规格' },
          { cell: `EG${row}`, column: 'EG', value: '欧美尺码', category: '尺码体系' },
          { cell: `EH${row}`, column: 'EH', value: '欧美尺码常规', category: '尺码版型' },
          { cell: `EI${row}`, column: 'EI', value: cycleItem.size, category: '尺码规格' }
        );

        // 尺码测量
        allRules.push(
          { cell: `EJ${row}`, column: 'EJ', value: cycleItem.co, category: '尺码测量' },
          { cell: `EK${row}`, column: 'EK', value: cycleItem.cp, category: '尺码测量' },
          { cell: `EL${row}`, column: 'EL', value: cycleItem.cq, category: '尺码测量' },
          { cell: `EM${row}`, column: 'EM', value: cycleItem.cr, category: '尺码测量' }
        );

        // 价格与海外发货仓库存
        allRules.push(
          { cell: `ER${row}`, column: 'ER', value: 45, category: '供货价格' },
          { cell: `ES${row}`, column: 'ES', value: 'CNY', category: '币种' },
          { cell: `ET${row}`, column: 'ET', value: 'NJ发货仓', category: '发货仓/NJ' },
          { cell: `EU${row}`, column: 'EU', value: 9999, category: '库存/NJ' },
          { cell: `EV${row}`, column: 'EV', value: 'GA发货仓', category: '发货仓/GA' },
          { cell: `EW${row}`, column: 'EW', value: 9999, category: '库存/GA' },
          { cell: `EX${row}`, column: 'EX', value: 'FL发货仓', category: '发货仓/FL' },
          { cell: `EY${row}`, column: 'EY', value: 9999, category: '库存/FL' },
          { cell: `EZ${row}`, column: 'EZ', value: 'CA发货仓', category: '发货仓/CA' },
          { cell: `FA${row}`, column: 'FA', value: 9999, category: '库存/CA' }
        );

        // 包裹规格
        allRules.push(
          { cell: `FR${row}`, column: 'FR', value: 35, category: '包装尺寸/长' },
          { cell: `FS${row}`, column: 'FS', value: 21, category: '包装尺寸/宽' },
          { cell: `FT${row}`, column: 'FT', value: 1, category: '包装尺寸/高' },
          { cell: `FU${row}`, column: 'FU', value: 180, category: '包装重量/克' }
        );

        // 图片直链写入 FV 列
        if (imageUrl) {
          allRules.push({
            cell: `FV${row}`,
            column: 'FV',
            value: imageUrl,
            category: `商品${k + 1}${colorName}款图片(FV列)`,
          });
        }
        
        // 新增: 图片直链写入 FW, FX, FY
        allRules.push({
          cell: `FW${row}`,
          column: 'FW',
          value: extraImages[0],
          category: `商品${k + 1}图片(FW列)`,
        });
        allRules.push({
          cell: `FX${row}`,
          column: 'FX',
          value: extraImages[1],
          category: `商品${k + 1}图片(FX列)`,
        });
        allRules.push({
          cell: `FY${row}`,
          column: 'FY',
          value: extraImages[2],
          category: `商品${k + 1}图片(FY列)`,
        });
      }

      skuCurrentRow += 5;
    });

    currentRow = skuCurrentRow;
  });

  return allRules;
}

/**
 * 构建针对单个商品实例的模板写入规则（兼容单商品模式）
 */
export function buildProductTemplateRules(
  productTitle?: string,
  blackImageUrl?: string,
  whiteImageUrl?: string,
  englishTitle?: string,
  selectedColor?: ColorMode,
  firstColor?: ColorKey,
  colorOrder?: ColorKey[]
): CellRule[] {
  return buildMultiProductTemplateRules([
    {
      title: productTitle || '',
      englishTitle,
      whiteImageUrl,
      blackImageUrl,
      selectedColor: selectedColor || 'black',
      firstColor: firstColor || 'black',
      colorOrder,
    },
  ]);
}

/**
 * 列映射与模板自定义配置基准
 */
export const DEFAULT_COLUMN_MAPPING: ColumnMappingConfig = {
  titleCol: 'C',
  whiteImageCol: 'FV',
  blackImageCol: 'FV',
  writeSpuImage: true,
  spuImageCol: 'FV',

  skuTypeCol: 'A',
  spuTypeCol: 'A',
  yearCol: 'B',
  skcYearCol: 'ED',
  colorCol: 'EE',
  sizeTypeCol: 'EF',
  sizeSystemCol: 'EG',
  sizeVersionCol: 'EH',
  sizeNameCol: 'EI',

  measureShoulderCol: 'EJ',
  measureBustCol: 'EK',
  measureLengthCol: 'EL',
  measureSleeveCol: 'EM',

  priceCol: 'ER',
  currencyCol: 'ES',
  defaultPrice: 45,
  defaultCurrency: 'CNY',

  warehouseNJCol: 'ET',
  stockNJCol: 'EU',
  warehouseGACol: 'EV',
  stockGACol: 'EW',
  warehouseFLCol: 'EX',
  stockFLCol: 'EY',
  warehouseCACol: 'EZ',
  stockCACol: 'FA',
  defaultStock: 9999,

  packageLengthCol: 'FR',
  packageWidthCol: 'FS',
  packageHeightCol: 'FT',
  packageWeightCol: 'FU',
  defaultPkgL: 35,
  defaultPkgW: 21,
  defaultPkgH: 1,
  defaultPkgWeight: 180,
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

const STORAGE_KEY_TEMPLATE_CONFIG = 'TEMPLATE_MAPPING_CONFIG_V1';

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



