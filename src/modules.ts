export interface AppModule {
  id: string;
  name: string;
  badge?: string;
  description: string;
  isAvailable: boolean;
}

export const APP_MODULES: AppModule[] = [
  {
    id: 'unified-workbench',
    name: '一体化工作台',
    badge: 'AI图改+模板生成',
    description: 'AI双色图片修改与模板生成一体化：商品标题填入C6、白色款链接填入EA6~11、黑色款链接填入EA12~16，自动写入SPU与SKU矩阵',
    isAvailable: true,
  },
  {
    id: 'template-inspector',
    name: '模板规格看板',
    badge: 'SKU矩阵',
    description: '查看与独立调试 7~16 行 2色×5码 标准 SKU 矩阵与 SPU 规格写入规则',
    isAvailable: true,
  },
];

