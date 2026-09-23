export type ToolType = 
  | 'pencil' 
  | 'eraser' 
  | 'bucket' 
  | 'eyedropper' 
  | 'line' 
  | 'rectangle' 
  | 'circle' 
  | 'select' 
  | 'pan';

export type BlendMode = 
  | 'source-over' 
  | 'multiply' 
  | 'screen' 
  | 'overlay' 
  | 'darken' 
  | 'lighten';

export interface Point {
  x: number;
  y: number;
}

export interface Dimensions {
  width: number;
  height: number;
}

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface PixelLayer {
  id: string;
  projectId: string;
  name: string;
  order: number;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: BlendMode;
  data: Uint32Array;
  createdAt: number;
  updatedAt: number;
}

export interface PaletteColor {
  id: string;
  hex: string;
  name: string;
}

export interface ColorPalette {
  id: string;
  name: string;
  colors: PaletteColor[];
  isCustom: boolean;
}

export interface CanvasHistoryRecord {
  id: string;
  timestamp: number;
  actionName: string;
  layerId: string;
  previousData: Uint32Array;
  newData: Uint32Array;
}

export interface ProjectMetadata {
  id: string;
  title: string;
  width: number;
  height: number;
  fps: number;
  createdAt: number;
  updatedAt: number;
  thumbnailUrl: string | null;
}

export interface ProjectSettings {
  gridVisible: boolean;
  gridColor: string;
  scanlinesEnabled: boolean;
  soundEffectsEnabled: boolean;
  pixelSnap: boolean;
  backgroundPattern: 'checker' | 'solid-dark' | 'solid-light';
}

export interface SelectionPixelTuple {
  index: number;
  color: number;
}

export interface SelectionState {
  active: boolean;
  origin: Point | null;
  current: Point | null;
  selectedPixels: SelectionPixelTuple[];
  floating: boolean;
}

export interface ViewportTransform {
  zoom: number;
  panX: number;
  panY: number;
}

export interface CanvasEditorState {
  currentProject: ProjectMetadata;
  layers: PixelLayer[];
  activeLayerId: string;
  selectedTool: ToolType;
  primaryColor: string;
  secondaryColor: string;
  brushSize: number;
  symmetryMode: 'none' | 'horizontal' | 'vertical' | 'both';
  viewport: ViewportTransform;
  selection: SelectionState;
  settings: ProjectSettings;
  activePaletteId: string;
  customPalettes: ColorPalette[];
}
