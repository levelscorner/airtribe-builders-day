export class MediaInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaInputError";
  }
}
