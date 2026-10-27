import {
  loadCategoryTemplateFile,
  type CategoryTemplateInfo,
  type WomenProductCategory,
} from '../../utils/categoryTemplateStorage';

export async function loadWomenCategoryTemplateFile(category: WomenProductCategory): Promise<{ file: File; info: CategoryTemplateInfo } | null> {
  return loadCategoryTemplateFile(category);
}
