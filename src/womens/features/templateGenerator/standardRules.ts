import { buildMultiProductTemplateRules } from './rules';
import { generate018SpuCode } from './rules';
import type { CellRule } from './types';
import type { ProductTemplateInput } from './rules';

const STANDARD_SIZE_CYCLE = [
  { size: 'S', shoulder: 41, bust: 88, length: 68, sleeve: 20 },
  { size: 'M', shoulder: 43, bust: 94, length: 70, sleeve: 20 },
  { size: 'L', shoulder: 45, bust: 100, length: 72, sleeve: 21 },
  { size: 'XL', shoulder: 47, bust: 106, length: 74, sleeve: 21 },
  { size: 'XXL', shoulder: 49, bust: 112, length: 76, sleeve: 22 },
];

const COLUMN_MAP: Record<string, string> = {
  CA: 'ED', CB: 'EE', CC: 'EF', CD: 'EG', CE: 'EH', CF: 'EI',
  CG: 'EJ', CH: 'EK', CI: 'EL', CJ: 'EM',
  CO: 'ER', CP: 'ES', CQ: 'ET', CR: 'EU', CS: 'EV', CT: 'EW',
  CU: 'EX', CV: 'EY', CW: 'EZ', CX: 'FA',
  DO: 'FR', DP: 'FS', DQ: 'FT', DR: 'FU',
  DS: 'FV', DT: 'FW', DU: 'FX', DV: 'FY',
};

function standardProductRules(product: ProductTemplateInput, productIndex: number): CellRule[] {
  const spuCode = product.spuCode || generate018SpuCode();
  const normalizedProduct = { ...product, spuCode };
  const sourceRules = buildMultiProductTemplateRules([{
    ...normalizedProduct,
    whiteExtraImages: {
      dt: 'https://img.kwcdn.com/product/open/7c8fd3b010b249b6ad9bd9f5e4cd93df-goods.jpeg?imageView2/2/w/800/q/70/format/avif',
      du: 'https://img.kwcdn.com/product/open/3483dde9f0ab430f86ed29b47e116a41-goods.jpeg?imageView2/2/w/800/q/70/format/avif',
      dv: 'https://img.kwcdn.com/product/open/19e5dc66ae634612a8a3c92022476e92-goods.jpeg?imageView2/2/w/800/q/70/format/avif',
    },
  }]);
  const rowOffset = productIndex * 11;

  const rules = sourceRules.flatMap((rule) => {
    const match = rule.cell.match(/^(\$?[A-Z]+\$?)(\d+)$/);
    if (!match) return [rule];

    const rawRow = Number(match[2]);
    const sourceRow = rawRow;
    if (sourceRow === 6) return [];
    if (sourceRow === 12 || sourceRow === 18) return [];

    let targetRow = sourceRow;
    if (sourceRow >= 13) targetRow -= 1;
    targetRow += rowOffset;

    const sourceColumn = rule.column;
    const targetColumn = COLUMN_MAP[sourceColumn] || sourceColumn;
    const nextRule: CellRule = {
      ...rule,
      cell: targetColumn + targetRow,
      column: targetColumn,
    };

    if (sourceRow >= 7 && sourceRow <= 11) {
      const size = STANDARD_SIZE_CYCLE[sourceRow - 7];
      if (sourceColumn === 'CF') nextRule.value = size.size;
      if (sourceColumn === 'CG') nextRule.value = size.shoulder;
      if (sourceColumn === 'CH') nextRule.value = size.bust;
      if (sourceColumn === 'CI') nextRule.value = size.length;
      if (sourceColumn === 'CJ') nextRule.value = size.sleeve;
    } else if (sourceRow >= 13 && sourceRow <= 17) {
      const size = STANDARD_SIZE_CYCLE[sourceRow - 13];
      if (sourceColumn === 'CF') nextRule.value = size.size;
      if (sourceColumn === 'CG') nextRule.value = size.shoulder;
      if (sourceColumn === 'CH') nextRule.value = size.bust;
      if (sourceColumn === 'CI') nextRule.value = size.length;
      if (sourceColumn === 'CJ') nextRule.value = size.sleeve;
    }

    return sourceColumn === 'DW' ? [] : [nextRule];
  });

  const spuRow = 6 + rowOffset;
  const fixedSpuValues: Array<[string, string | number]> = [
    ['A', 'spu'], ['E', '中国大陆'], ['F', '广东省'], ['G', '中国大陆'],
    ['Q', '有机棉'], ['R', '棉'], ['S', '100%'],
    ['AB', '数码印花类可机洗且不可干洗'], ['AC', 'ALL/全球/所有'], ['AD', '圆领'],
    ['AE', '微弹'], ['AF', '半透'], ['AG', '表情符号'], ['AH', '无'], ['AI', '成人'],
    ['AP', '运动'], ['AZ', '运动'], ['BJ', '宽松'], ['BK', '梭织'], ['BL', '定位印花'],
    ['BM', '光面'], ['BN', 180], ['BO', 'g/㎡'], ['BP', '无里料/无内衬'],
    ['EN', 'Julian Vance'], ['EO', 'M'], ['EP', '偏大'],
  ];
  const spuRules: CellRule[] = fixedSpuValues.map(([column, value]) => ({
    cell: column + spuRow,
    column,
    value,
    category: '女士标码 SPU 预设属性',
  }));
  spuRules.push(
    { cell: 'B' + spuRow, column: 'B', value: spuCode, category: '女士标码 SPU 编号' },
    { cell: 'C' + spuRow, column: 'C', value: product.title || '', category: '女士标码中文标题' },
    { cell: 'D' + spuRow, column: 'D', value: product.englishTitle || product.title || '', category: '女士标码英文标题' },
  );

  const colors = product.colorOrder?.length
    ? product.colorOrder.filter((color) => color === 'white' || color === 'black')
    : ['white', 'black'];
  const firstColor = colors[0] || 'white';
  const firstImage = firstColor === 'white' ? product.whiteImageUrl : product.blackImageUrl;
  if (firstImage) spuRules.push({ cell: 'FV' + spuRow, column: 'FV', value: firstImage, category: '女士标码 SPU 首图' });
  const firstExtras = firstColor === 'white'
    ? [
      'https://img.kwcdn.com/product/open/7c8fd3b010b249b6ad9bd9f5e4cd93df-goods.jpeg?imageView2/2/w/800/q/70/format/avif',
      'https://img.kwcdn.com/product/open/3483dde9f0ab430f86ed29b47e116a41-goods.jpeg?imageView2/2/w/800/q/70/format/avif',
      'https://img.kwcdn.com/product/open/19e5dc66ae634612a8a3c92022476e92-goods.jpeg?imageView2/2/w/800/q/70/format/avif',
    ]
    : [
      'https://img.kwcdn.com/product/open/e297987d009742399e77e6fee09197f0-goods.jpeg',
      'https://img.kwcdn.com/product/open/b2ff0cd7a9254b0b926a075e84fb9d12-goods.jpeg',
      'https://img.kwcdn.com/product/open/da5675724f5f457087d2a15349f82681-goods.jpeg',
    ];
  ['FW', 'FX', 'FY'].forEach((column, index) => spuRules.push({
    cell: column + spuRow,
    column,
    value: firstExtras[index],
    category: '女士标码 SPU 附图',
  }));

  return [...spuRules, ...rules];
}

export function buildStandardTemplateRules(products: ProductTemplateInput[]): CellRule[] {
  return products.flatMap((product, index) => standardProductRules(product, index));
}
