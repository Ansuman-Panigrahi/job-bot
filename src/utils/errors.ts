export class AppError extends Error {
  public readonly code: string;

  constructor(message: string, code: string = 'APP_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BrowserError extends AppError {
  constructor(message: string, code: string = 'BROWSER_ERROR') {
    super(message, code);
  }
}

export class NavigationError extends BrowserError {
  constructor(message: string) {
    super(message, 'NAVIGATION_ERROR');
  }
}
