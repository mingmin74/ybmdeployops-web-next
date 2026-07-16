import { defineBoot } from '#q-app';
import { Notify } from 'quasar';

function notifyError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unexpected error';
  Notify.create({ type: 'negative', message });
}

export default defineBoot(({ app }) => {
  app.config.errorHandler = (error) => {
    notifyError(error);
  };

  window.addEventListener('unhandledrejection', (event) => {
    notifyError(event.reason);
  });
});
