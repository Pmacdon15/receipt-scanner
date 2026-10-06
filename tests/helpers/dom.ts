import { afterAll, afterEach } from "bun:test"
import { GlobalRegistrator } from "@happy-dom/global-registrator"

// Gives a component test file a browser-like DOM (happy-dom). Call it at the
// top of the file, then load Testing Library and the component with a dynamic
// import so they see the DOM globals when they initialise.
export async function setupDom() {
  GlobalRegistrator.register({ url: "http://localhost:3000/" })
  // Lets React flush updates inside act() without a warning per render.
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true

  const testingLibrary = await import("@testing-library/react")

  afterEach(() => testingLibrary.cleanup())
  // In --isolate mode, the process terminates after all tests, so tearing down
  // globals early risks pending React 19 scheduler callbacks hitting missing window.
  afterAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50))
    GlobalRegistrator.unregister()
  })

  return testingLibrary
}
