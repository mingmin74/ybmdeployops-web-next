import { defineStore } from 'pinia';
import { shallowRef } from 'vue';

export const useUiStore = defineStore('ui', () => {
  const menuMini = shallowRef(localStorage.getItem('menuMini') === 'true');
  const storedMaxOpenTabs = Number(localStorage.getItem('maxOpenTabs'));
  const maxOpenTabs = shallowRef(
    Number.isSafeInteger(storedMaxOpenTabs) && storedMaxOpenTabs > 0 ? storedMaxOpenTabs : 10
  );

  function setMaxOpenTabs(value: number) {
    if (!Number.isSafeInteger(value) || value < 1) return;
    maxOpenTabs.value = value;
    localStorage.setItem('maxOpenTabs', String(value));
  }

  function toggleMenuMini() {
    menuMini.value = !menuMini.value;
    localStorage.setItem('menuMini', String(menuMini.value));
  }

  return { menuMini, maxOpenTabs, setMaxOpenTabs, toggleMenuMini };
});
