import { defineBoot } from '#q-app';
import { installLocale } from '@/locale';

export default defineBoot(({ app }) => {
  installLocale(app);
});
