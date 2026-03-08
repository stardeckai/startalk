export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private persistentStream: MediaStream | null = null;
  private stopping = false;

  /** Acquire the mic stream once at startup. */
  async warmup(): Promise<void> {
    if (this.persistentStream) return;
    this.persistentStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    console.log('[StarTalk] Mic stream warmed up');
  }

  async start(): Promise<void> {
    this.stopping = false;
    this.chunks = [];

    if (!this.persistentStream) {
      await this.warmup();
    }

    // Clone the track so the MediaRecorder gets a fresh, active track each time
    const sourceTrack = this.persistentStream!.getAudioTracks()[0];
    if (!sourceTrack) throw new Error('No audio track available');
    const clonedTrack = sourceTrack.clone();
    const stream = new MediaStream([clonedTrack]);

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : undefined;

    this.mediaRecorder = new MediaRecorder(stream, { mimeType });

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
        // Stop the cloned track, keep the persistent stream alive
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
    this.persistentStream?.getTracks().forEach((t) => t.stop());
    this.persistentStream = null;
    this.mediaRecorder = null;
    this.chunks = [];
  }
}
