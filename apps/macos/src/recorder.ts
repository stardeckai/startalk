const STREAM_IDLE_TIMEOUT = 60_000; // Release mic after 60s of inactivity

export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stopping = false;
  private stream: MediaStream | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  private clearIdleTimer() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private scheduleRelease() {
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      console.log('[StarTalk] Releasing idle mic stream');
      this.releaseStream();
    }, STREAM_IDLE_TIMEOUT);
  }

  private releaseStream() {
    this.stream?.getTracks().forEach((t) => {
      t.stop();
    });
    this.stream = null;
  }

  private async ensureStream(): Promise<MediaStream> {
    if (this.stream) {
      // Check if tracks are still alive
      const track = this.stream.getAudioTracks()[0];
      if (track && track.readyState === 'live') {
        return this.stream;
      }
      // Dead stream, re-acquire
      this.stream = null;
    }
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    console.log('[StarTalk] Mic stream acquired');
    return this.stream;
  }

  async start(): Promise<void> {
    this.stopping = false;
    this.chunks = [];
    this.clearIdleTimer();

    const stream = await this.ensureStream();
    const clonedTrack = stream.getAudioTracks()[0].clone();
    const recordingStream = new MediaStream([clonedTrack]);

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : undefined;

    this.mediaRecorder = new MediaRecorder(recordingStream, { mimeType });

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
        // Stop the cloned track, keep the shared stream alive
        this.mediaRecorder?.stream.getTracks().forEach((t) => {
          t.stop();
        });
        this.mediaRecorder = null;
        this.chunks = [];
        // Schedule mic release after idle period
        this.scheduleRelease();
        resolve(blob);
      };

      this.mediaRecorder.stop();
    });
  }

  get isRecording(): boolean {
    return this.mediaRecorder?.state === 'recording' && !this.stopping;
  }

  release(): void {
    this.clearIdleTimer();
    this.releaseStream();
    this.mediaRecorder = null;
    this.chunks = [];
  }
}
