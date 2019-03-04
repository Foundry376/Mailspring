import { Category } from 'mailspring-exports';

export type CategoryData =
  | {
      searchValue: string;
      newCategoryItem: boolean;
      id: string;
    }
  | {
      category: Category;
      displayName: string;
      backgroundColor: string;
      usage: number;
      numThreads: number;
    };
