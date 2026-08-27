<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue';
import { getGrantedPermissions, type GrantedPermissions } from '@/api/system';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';

type PermissionNode = {
  id: string;
  label: string;
  type: 'path' | 'permission';
  propagate?: boolean;
  children?: PermissionNode[];
};

const visible = defineModel<boolean>({ default: false });
const { userid } = defineProps<{ userid: string }>();
const loading = shallowRef(false);
const nodes = shallowRef<PermissionNode[]>([]);
const expanded = shallowRef<string[]>(['/']);
const title = computed(() => `${userid} - ${gettext('Granted Permissions')}`);

function buildTree(data: GrantedPermissions) {
  const paths = new Map<string, PermissionNode>();
  paths.set('/', { id: '/', label: '/', type: 'path', children: [] });

  Object.entries(data).forEach(([path, permissions]) => {
    paths.set(path, {
      id: path,
      label: path,
      type: 'path',
      children: Object.entries(permissions)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([permission, propagate]) => ({
          id: `${path}:${permission}`,
          label: permission,
          type: 'permission',
          propagate: propagate === 1,
        })),
    });
  });

  const root = paths.get('/')!;
  [...paths.entries()]
    .filter(([path]) => path !== '/')
    .sort(([left], [right]) => left.localeCompare(right))
    .forEach(([path, node]) => {
      const segments = path.split('/');
      let parent = root;
      while (segments.pop()) {
        const candidate = paths.get(segments.join('/'));
        if (candidate) {
          parent = candidate;
          break;
        }
      }
      parent.children!.push(node);
    });

  nodes.value = [root];
  expanded.value = [...paths.keys()];
}

let requestVersion = 0;
watch(
  [visible, () => userid],
  async ([isVisible, value]) => {
    if (!isVisible || !value) return;
    const version = ++requestVersion;
    loading.value = true;
    try {
      const response = await getGrantedPermissions(value);
      if (version === requestVersion) buildTree(response.data || {});
    } finally {
      if (version === requestVersion) loading.value = false;
    }
  },
  { immediate: true },
);
</script>

<template>
  <q-dialog v-model="visible" class="granted-permissions-dialog">
    <UWindow width="800px" height="600px" :title="title" :loading="loading">
      <div class="q-pa-md full-height column">
        <div class="permission-header text-weight-medium text-grey-8 q-pb-sm q-mb-sm">
          <span>{{ gettext('Path') }}/{{ gettext('Permission') }}</span><span>{{ gettext('Propagate') }}</span>
        </div>
        <q-scroll-area class="permission-tree-scroll">
          <q-tree v-model:expanded="expanded" :nodes="nodes" node-key="id" label-key="label" children-key="children" no-nodes-label="">
            <template #default-header="scope">
              <div class="permission-node full-width"><span :class="scope.node.type === 'permission' ? 'text-primary' : ''">{{ scope.node.label }}</span><span>{{ scope.node.type === 'permission' ? (scope.node.propagate ? gettext('Yes') : gettext('No')) : '' }}</span></div>
            </template>
          </q-tree>
        </q-scroll-area>
      </div>
    </UWindow>
  </q-dialog>
</template>

<style scoped>
.permission-header, .permission-node { display: grid; grid-template-columns: minmax(0, 6fr) minmax(90px, 1fr); column-gap: 16px; }
.permission-tree-scroll { height: 470px; }
.granted-permissions-dialog :deep(.q-dialog__inner > .u-window-card) { overflow: hidden; }
</style>
