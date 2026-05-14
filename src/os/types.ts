import type { ComponentType } from 'react';

export type AppId = string;

export interface IconProps {
  className?: string;
  size?: number | string;
  strokeWidth?: number | string;
}

export interface AppManifest {
  id: AppId;
  name: string;
  description: string;
  // Lucide icons + any custom icon that accepts size/className
  icon: ComponentType<IconProps & Record<string, unknown>>;
  /** Default window size when launched */
  defaultSize?: { width: number; height: number };
  /** Default window position; if omitted we center */
  defaultPosition?: { x: number; y: number };
  /** If true, the app does not appear in the dock by default */
  hideFromDock?: boolean;
  /** Accent color for the icon background */
  accent?: string;
}

export interface AppModule {
  manifest: AppManifest;
  Component: ComponentType<WindowAppProps>;
}

export interface WindowAppProps {
  windowId: string;
  appId: AppId;
}

export interface WindowState {
  id: string;
  appId: AppId;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  minimized: boolean;
  maximized: boolean;
  /** Saved bounds for un-maximize */
  prevBounds?: { x: number; y: number; width: number; height: number };
}
