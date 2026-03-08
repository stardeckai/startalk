export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stopping = false;

  async start(): Promise<void> {
    this.stopping = false;
    this.chunks = [];

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : undefined;

    this.mediaRecorder = new MediaRecorder(stream, { mimeType });

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };

    return new Promise<void>((resolve) => {
      this.mediaRecorder!.onstart = () => resolve();
      this.mediaRecorder!.start();
    });
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
        // Stop all tracks to release the mic
        this.mediaRecorder?.stream.getTracks().forEach((t) => t.stop());
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
    this.mediaRecorder?.stream.getTracks().forEach((t) => t.stop());
    this.mediaRecorder = null;
    this.chunks = [];
  }
}
