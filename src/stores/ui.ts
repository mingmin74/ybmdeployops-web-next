import { defineStore } from 'pinia';
import { shallowRef } from 'vue';

export const useUiStore = defineStore('ui', () => {
  const menuMini = shallowRef(localStorage.getItem('menuMini') === 'true');

  function toggleMenuMini() {
    menuMini.value = !menuMini.value;
    localStorage.setItem('menuMini', String(menuMini.value));
  }

  return { menuMini, toggleMenuMini };
});
