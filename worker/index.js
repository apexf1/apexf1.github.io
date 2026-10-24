// Sites/Workers entrypoint: the app is a static Vite SPA, so the Worker only
// forwards requests to the assets binding (SPA fallback is set in the manifest).
export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
};
