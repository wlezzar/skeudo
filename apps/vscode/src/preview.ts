import { enhance } from '@skeudo/html';

// Runs once per preview. The preview updates its content in place, and enhance() listens on the
// document, so the highlighting keeps working on sketches rendered later.
enhance(document);
