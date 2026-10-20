export type TemplateGenderFormat = 'women' | 'men' | 'mixed_men_women';

export interface SheetInfo {
  index: number;
  name: string;
  isVisible: boolean;
  isTarget: boolean;
}

export interface CellRule {
  cell: string;
  column: string;
  value: string | number;
  category: string;
}

export interface CellModification {
  cell: string;
  column: string;
  value: string | number;
  originalValue: string;
  verifiedValue: string;
  category: string;
}

export interface TemplateResult {
  fileName: string;
  targetSheetName: string;
  targetSheetIndex: number;
  allSheets: SheetInfo[];
  modifications: CellModification[];
  outputBlob: Blob;
  message: string;
}

export interface SpuAttributeRule {
  id: string;
  column: string;
  value: string | number;
  category: string;
  enabled: boolean;
}

export interface SkuSizeItem {
  size: string;
  co: number; // 肩宽
  cp: number; // 胸围
  cq: number; // 衣长
  cr: number; // 袖长
  price?: number;
  pkgWeight?: number;
}

export interface ColumnMappingConfig {
  // 标题与图片写入列
  titleCol: string;
  whiteImageCol: string;
  blackImageCol: string;
  writeSpuImage: boolean;
  spuImageCol: string;

  // SKU 基础属性列
  skuTypeCol: string;
  spuTypeCol: string;
  yearCol: string;
  skcYearCol: string;
  colorCol: string;
  sizeTypeCol: string;
  sizeSystemCol: string;
  sizeVersionCol: string;
  sizeNameCol: string;

  // 尺码测量规格列
  measureShoulderCol: string;
  measureBustCol: string;
  measureLengthCol: string;
  measureSleeveCol: string;

  // 供货价格与币种
  priceCol: string;
  currencyCol: string;
  defaultPrice: number;
  defaultCurrency: string;

  // 海外4仓库存
  warehouseNJCol: string;
  stockNJCol: string;
  warehouseGACol: string;
  stockGACol: string;
  warehouseFLCol: string;
  stockFLCol: string;
  warehouseCACol: string;
  stockCACol: string;
  defaultStock: number;

  // 包裹尺寸与重量
  packageLengthCol: string;
  packageWidthCol: string;
  packageHeightCol: string;
  packageWeightCol: string;
  defaultPkgL: number;
  defaultPkgW: number;
  defaultPkgH: number;
  defaultPkgWeight: number;
}

export interface TemplateMappingConfig {
  presetName: string;
  targetSheetIndex: number; // -1 for auto (2nd sheet or 1st)
  spuStartRow: number; // 默认 6
  whiteSkuCount: number; // 默认 5 (S, M, L, XL, XXL)
  blackSkuCount: number; // 默认 5 (S, M, L, XL, XXL)
  columns: ColumnMappingConfig;
  spuRules: SpuAttributeRule[];
  sizeMatrix: SkuSizeItem[];
}

export interface TemplateSheetHeaderInfo {
  sheetName: string;
  sheetIndex: number;
  headers: {
    column: string;
    colIndex: number;
    headerName: string;
    sampleValues?: string[];
  }[];
}
