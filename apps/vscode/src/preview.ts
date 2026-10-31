import { enhance } from '@sketch/html';

// Runs once per preview. The preview updates its content in place, and enhance() listens on the
// document, so the highlighting keeps working on sketches rendered later.
enhance(document);
