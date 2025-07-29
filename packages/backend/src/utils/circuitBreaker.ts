import { logger } from './logger';

export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerOptions {
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
  monitoringPeriod: number;
  name?: string;
}

export interface CircuitBreakerMetrics {
  state: CircuitBreakerState;
  failures: number;
  successes: number;
  requests: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  stateChangedAt: number;
}

export class CircuitBreakerError extends Error {
  constructor(message: string, public metrics: CircuitBreakerMetrics) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

/**
 * サーキットブレーカーパターンの実装
 * 外部サービス（X API等）への呼び出しを保護し、障害時の自動回復を支援
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failures = 0;
  private successes = 0;
  private requests = 0;
  private lastFailureTime: number | null = null;
  private lastSuccessTime: number | null = null;
  private stateChangedAt = Date.now();
  private readonly options: Required<CircuitBreakerOptions>;

  constructor(options: CircuitBreakerOptions) {
    this.options = {
      name: 'CircuitBreaker',
      ...options,
    };

    logger.info('サーキットブレーカーを初期化しました', {
      name: this.options.name,
      options: this.options,
    });
  }

  /**
   * 操作を実行し、サーキットブレーカーで保護する
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    return this.call(operation);
  }

  /**
   * 内部呼び出しメソッド
   */
  private async call<T>(operation: () => Promise<T>): Promise<T> {
    const canExecute = this.canExecute();
    
    if (!canExecute) {
      const error = new CircuitBreakerError(
        `サーキットブレーカー ${this.options.name} が開いています (状態: ${this.state})`,
        this.getMetrics()
      );
      
      logger.warn('サーキットブレーカーにより操作が拒否されました', {
        name: this.options.name,
        state: this.state,
        failures: this.failures,
        lastFailureTime: this.lastFailureTime,
      });
      
      throw error;
    }

    this.requests++;

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  /**
   * 操作実行可能かチェック
   */
  private canExecute(): boolean {
    if (this.state === CircuitBreakerState.CLOSED) {
      return true;
    }

    if (this.state === CircuitBreakerState.OPEN) {
      return this.shouldAttemptReset();
    }

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      return true;
    }

    return false;
  }

  /**
   * 成功時の処理
   */
  private onSuccess(): void {
    this.successes++;
    this.lastSuccessTime = Date.now();

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      if (this.successes >= this.options.successThreshold) {
        this.reset();
      }
    }

    // 監視期間経過後のリセット処理
    if (this.shouldResetCounters()) {
      this.resetCounters();
    }

    logger.debug('サーキットブレーカー成功', {
      name: this.options.name,
      state: this.state,
      successes: this.successes,
      failures: this.failures,
    });
  }

  /**
   * 失敗時の処理
   */
  private onFailure(error: unknown): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    logger.warn('サーキットブレーカー失敗', {
      name: this.options.name,
      state: this.state,
      failures: this.failures,
      error: error instanceof Error ? error.message : String(error),
    });

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.trip();
      return;
    }

    if (this.state === CircuitBreakerState.CLOSED) {
      if (this.failures >= this.options.failureThreshold) {
        this.trip();
      }
    }
  }

  /**
   * サーキットブレーカーを開く（OPEN状態にする）
   */
  private trip(): void {
    this.state = CircuitBreakerState.OPEN;
    this.stateChangedAt = Date.now();

    logger.warn('サーキットブレーカーが開きました', {
      name: this.options.name,
      failures: this.failures,
      threshold: this.options.failureThreshold,
      timeout: this.options.timeout,
    });
  }

  /**
   * サーキットブレーカーをリセット（CLOSED状態にする）
   */
  private reset(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.stateChangedAt = Date.now();
    this.resetCounters();

    logger.info('サーキットブレーカーがリセットされました', {
      name: this.options.name,
      successes: this.successes,
    });
  }

  /**
   * HALF_OPEN状態への移行を試みる
   */
  private shouldAttemptReset(): boolean {
    const now = Date.now();
    const timeSinceOpen = now - this.stateChangedAt;

    if (timeSinceOpen >= this.options.timeout) {
      this.state = CircuitBreakerState.HALF_OPEN;
      this.stateChangedAt = now;
      this.resetCounters();

      logger.info('サーキットブレーカーがHALF_OPEN状態になりました', {
        name: this.options.name,
        timeSinceOpen,
        timeout: this.options.timeout,
      });

      return true;
    }

    return false;
  }

  /**
   * カウンターリセットが必要かチェック
   */
  private shouldResetCounters(): boolean {
    const now = Date.now();
    return now - this.stateChangedAt >= this.options.monitoringPeriod;
  }

  /**
   * カウンターをリセット
   */
  private resetCounters(): void {
    this.failures = 0;
    this.successes = 0;
    this.requests = 0;
  }

  /**
   * 現在のメトリクスを取得
   */
  getMetrics(): CircuitBreakerMetrics {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      requests: this.requests,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      stateChangedAt: this.stateChangedAt,
    };
  }

  /**
   * 強制的にサーキットブレーカーを開く
   */
  forceOpen(): void {
    this.trip();
    logger.warn('サーキットブレーカーが強制的に開かれました', {
      name: this.options.name,
    });
  }

  /**
   * 強制的にサーキットブレーカーをリセット
   */
  forceReset(): void {
    this.reset();
    logger.info('サーキットブレーカーが強制的にリセットされました', {
      name: this.options.name,
    });
  }

  /**
   * 現在の状態を取得
   */
  getState(): CircuitBreakerState {
    return this.state;
  }

  /**
   * 統計情報を取得
   */
  getStats() {
    const now = Date.now();
    const uptime = now - (this.stateChangedAt || now);
    const failureRate = this.requests > 0 ? (this.failures / this.requests) * 100 : 0;
    const successRate = this.requests > 0 ? (this.successes / this.requests) * 100 : 0;

    return {
      name: this.options.name,
      state: this.state,
      uptime,
      requests: this.requests,
      failures: this.failures,
      successes: this.successes,
      failureRate: Math.round(failureRate * 100) / 100,
      successRate: Math.round(successRate * 100) / 100,
      lastFailure: this.lastFailureTime,
      lastSuccess: this.lastSuccessTime,
      options: this.options,
    };
  }
}

/**
 * 指数バックオフ機能
 */
export class ExponentialBackoff {
  private attempts = 0;
  private readonly maxAttempts: number;
  private readonly baseDelay: number;
  private readonly maxDelay: number;
  private readonly jitter: boolean;

  constructor(options: {
    maxAttempts: number;
    baseDelay: number;
    maxDelay?: number;
    jitter?: boolean;
  }) {
    this.maxAttempts = options.maxAttempts;
    this.baseDelay = options.baseDelay;
    this.maxDelay = options.maxDelay || 60000; // 最大60秒
    this.jitter = options.jitter ?? true;
  }

  /**
   * 次の遅延時間を計算
   */
  getNextDelay(): number {
    if (this.attempts >= this.maxAttempts) {
      throw new Error(`最大リトライ回数 ${this.maxAttempts} を超えました`);
    }

    // 指数バックオフ: baseDelay * 2^attempts
    let delay = this.baseDelay * Math.pow(2, this.attempts);
    
    // 最大遅延時間を超えないようにクランプ
    delay = Math.min(delay, this.maxDelay);

    // ジッターを追加してサンダリングハード問題を回避
    if (this.jitter) {
      delay = delay * (0.5 + Math.random() * 0.5);
    }

    this.attempts++;
    
    logger.debug('指数バックオフ遅延計算', {
      attempts: this.attempts,
      maxAttempts: this.maxAttempts,
      delay: Math.round(delay),
      baseDelay: this.baseDelay,
    });

    return Math.round(delay);
  }

  /**
   * 遅延実行
   */
  async delay(): Promise<void> {
    const delayMs = this.getNextDelay();
    return new Promise(resolve => setTimeout(resolve, delayMs));
  }

  /**
   * リトライ可能かチェック
   */
  canRetry(): boolean {
    return this.attempts < this.maxAttempts;
  }

  /**
   * リセット
   */
  reset(): void {
    this.attempts = 0;
  }

  /**
   * 現在の試行回数を取得
   */
  getAttempts(): number {
    return this.attempts;
  }
}

/**
 * リトライ可能な操作を実行するヘルパー関数
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: {
    maxAttempts: number;
    baseDelay: number;
    maxDelay?: number;
    shouldRetry?: (error: unknown) => boolean;
    onRetry?: (error: unknown, attempt: number) => void;
  }
): Promise<T> {
  const backoff = new ExponentialBackoff({
    maxAttempts: options.maxAttempts,
    baseDelay: options.baseDelay,
    maxDelay: options.maxDelay,
  });

  while (true) {
    try {
      return await operation();
    } catch (error) {
      const shouldRetry = options.shouldRetry ? options.shouldRetry(error) : true;
      
      if (!shouldRetry || !backoff.canRetry()) {
        logger.error('リトライ終了', {
          attempts: backoff.getAttempts(),
          maxAttempts: options.maxAttempts,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }

      if (options.onRetry) {
        options.onRetry(error, backoff.getAttempts());
      }

      logger.warn('操作をリトライします', {
        attempt: backoff.getAttempts(),
        maxAttempts: options.maxAttempts,
        error: error instanceof Error ? error.message : String(error),
      });

      await backoff.delay();
    }
  }
}