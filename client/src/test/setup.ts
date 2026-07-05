import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement scrollIntoView; MessageList calls it after each
// render to keep the latest message in view.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
