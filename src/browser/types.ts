export interface BrowserManagerOptions {
  headless?: boolean;
  defaultTimeout?: number;
}

export interface NavigationResult {
  url: string;
  title: string;
}
