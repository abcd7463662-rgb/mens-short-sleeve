import { executeTemplateGeneration as executeMenTemplateGeneration } from './engine';
import { buildMultiProductTemplateRules as buildMenRules } from './rules';
import { buildMultiProductTemplateRules as buildWomenRules } from '../../womens/features/templateGenerator/rules';
import { buildMultiProductTemplateRules as buildSportRules } from '../../womens/features/templateGenerator/sportRules';
import { buildStandardTemplateRules } from '../../womens/features/templateGenerator/standardRules';

type ExportRequest = {
  template: ArrayBuffer;
  templateName: string;
  outputName: string;
  products: any[];
  gender: 'men' | 'women';
  category?: string;
};

self.onmessage = async (event: MessageEvent<ExportRequest>) => {
  const { template, templateName, outputName, products, gender, category } = event.data;
  try {
    self.postMessage({ type: 'progress', phase: '正在生成商品写入规则...' });
    const rules = gender === 'men'
      ? buildMenRules(products)
      : category === 'womens-sport-tee'
        ? buildSportRules(products)
        : category === 'womens-standard-tee'
          ? buildStandardTemplateRules(products)
          : buildWomenRules(products);

    self.postMessage({ type: 'progress', phase: `正在写入 ${products.length} 款商品...` });
    const templateFile = new File([template], templateName, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const executeTemplateGeneration = gender === 'men'
      ? executeMenTemplateGeneration
      : (await import('../../womens/features/templateGenerator/engine')).executeTemplateGeneration;
    const result = await executeTemplateGeneration(templateFile, undefined, rules, { collectModifications: false });

    self.postMessage({ type: 'progress', phase: '正在打包 Excel 文件...' });
    const buffer = await result.outputBlob.arrayBuffer();
    self.postMessage({ type: 'complete', buffer, fileName: outputName }, { transfer: [buffer] });
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : '整合表格生成失败' });
  }
};
