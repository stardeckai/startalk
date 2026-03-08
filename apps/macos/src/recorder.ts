export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private stopping = false;
  private mimeType: string | undefined;

  /** Acquire the mic stream once so start() is instant. */
  async warmup(): Promise<void> {
    if (this.stream) return;
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : undefined;
    console.log('[StarTalk] Mic stream warmed up');
  }

  async start(): Promise<void> {
    this.stopping = false;
    this.chunks = [];

    // Ensure we have a stream (instant if already warmed up)
    if (!this.stream) {
      await this.warmup();
    }

    this.mediaRecorder = new MediaRecorder(this.stream!, { mimeType: this.mimeType });

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };

    this.mediaRecorder.start();
  }

  stop(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || this.stopping) {
        reject(new Error('Not recording'));
        return;
      }

      this.stopping = true;

      this.mediaRecorder.onstop = () => {
        const mimeType = this.mediaRecorder?.mimeType ?? 'audio/webm';
        const blob = new Blob(this.chunks, { type: mimeType });
        // Don't release the stream — keep it for next recording
        this.mediaRecorder = null;
        this.chunks = [];
        resolve(blob);
      };

      this.mediaRecorder.stop();
    });
  }

  get isRecording(): boolean {
    return this.mediaRecorder?.state === 'recording' && !this.stopping;
  }

  release(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.mediaRecorder = null;
    this.chunks = [];
  }
}
