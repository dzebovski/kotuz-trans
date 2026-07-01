export type WialonGeoCell = {
  t?: string;
  v?: number;
  vt?: number;
  y?: number;
  x?: number;
  u?: number;
};

export type WialonStatCell = string | WialonGeoCell | null;

export type WialonStatRow = {
  n?: string;
  c?: WialonStatCell[];
};

export type WialonTableRow = {
  n?: number;
  c?: WialonStatCell[];
};

export type WialonReportAttachment = {
  name?: string;
  type?: string;
  datasets?: string[];
};

export type WialonChartDataset = {
  name?: string;
  color?: number;
  units_x?: string;
  units?: string | null;
  y_axis?: number;
  data?: {
    x?: number[];
    y?: number[];
  };
};

export type WialonChartJson = {
  datasets?: Record<string, WialonChartDataset>;
};

export type WialonApplyReportResult = {
  reportResult?: {
    stats?: WialonStatRow[];
    tables?: Array<{
      name?: string;
      label?: string;
      rows?: number;
      level?: number;
      columns?: number;
    }>;
    attachments?: WialonReportAttachment[] | number;
  };
};

export type WialonSelectRowsResult = {
  rows?: WialonTableRow[];
};

export type WialonReportStatus = 1 | 2 | 4 | 8 | 16;

export type ReportInterval = {
  flags: number;
  from: number;
  to: number;
};

export type ExecReportParams = {
  reportResourceId: number;
  reportTemplateId: number;
  reportObjectId: number;
  reportObjectSecId: number;
  interval: ReportInterval;
  remoteExec: number;
};

export type SelectRowsConfig = {
  tableIndex: number;
  from: number;
  to: number;
  level?: number;
};
