export interface TableColumn {
  id: string;
  name: string;
}

export type TableRow = {
  id: string;
  [key: string]: any;
};
