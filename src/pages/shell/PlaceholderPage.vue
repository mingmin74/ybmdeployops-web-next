<script setup lang="ts">
import { computed, onMounted, shallowRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getNodes, type PveNode } from '@/api/host';
import { gettext } from '@/locale';
import NodeShellPanel from '@/pages/host/components/NodeShellPanel.vue';

const route = useRoute();
const router = useRouter();
const loading = shallowRef(false);
const nodes = shallowRef<PveNode[]>([]);
const selectedNode = shallowRef('');
const activeNode = shallowRef('');
const connectionKey = shallowRef(0);
const isShellPage = computed(() => route.name === 'node-shell');

const nodeOptions = computed(() =>
  nodes.value.map((node) => ({
    label: node.status === 'online' ? node.node : `${node.node} (${gettext('offline')})`,
    value: node.node,
    disable: node.status !== 'online',
  }))
);

async function loadNodes() {
  loading.value = true;
  try {
    const response = await getNodes();
    nodes.value = [...(response.data || [])].sort((left, right) =>
      left.node.localeCompare(right.node)
    );
    const requestedNode = typeof route.query.node === 'string' ? route.query.node : '';
    const preferredNode =
      requestedNode ||
      selectedNode.value ||
      nodes.value.find((node) => node.status === 'online')?.node ||
      '';
    const availableNode =
      nodes.value.find((node) => node.node === preferredNode && node.status === 'online')?.node ||
      '';
    selectedNode.value = availableNode;
    if (availableNode) connect();
  } finally {
    loading.value = false;
  }
}

function connect() {
  if (!selectedNode.value) return;
  activeNode.value = selectedNode.value;
  connectionKey.value += 1;
  void router.replace({ query: { ...route.query, node: selectedNode.value } });
}

function closeTerminal() {
  // Unmounting the native xterm.js frame closes its WebSocket and termproxy session.
  activeNode.value = '';
}

watch(
  () => route.query.node,
  (node) => {
    if (isShellPage.value && typeof node === 'string' && node !== selectedNode.value) {
      selectedNode.value = node;
      void loadNodes();
    }
  }
);

onMounted(() => {
  if (isShellPage.value) void loadNodes();
});
</script>

<template>
  <q-page
    v-if="isShellPage"
    class="node-shell-page q-pa-md"
  >
    <q-card
      flat
      bordered
    >
      <q-card-section class="row items-center q-col-gutter-md">
        <div class="col-auto">
          <q-icon
            name="terminal"
            size="28px"
            color="primary"
          />
        </div>
        <div class="col-auto">
          <div class="text-h6">{{ gettext('Shell') }}</div>
        </div>
        <q-space />
        <q-select
          v-model="selectedNode"
          class="col-12 col-sm-4"
          dense
          outlined
          emit-value
          map-options
          :options="nodeOptions"
          :label="gettext('Node')"
          :loading="loading"
        />
        <q-btn
          no-caps
          outline
          color="primary"
          icon="terminal"
          :disable="!selectedNode"
          :loading="loading"
          :label="gettext('Connect')"
          @click="connect"
        />
        <q-btn
          no-caps
          flat
          color="grey-8"
          icon="close"
          :disable="!activeNode"
          :label="gettext('Close')"
          @click="closeTerminal"
        />
      </q-card-section>
    </q-card>

    <q-card
      flat
      bordered
      class="node-shell-page__terminal q-mt-md"
    >
      <NodeShellPanel
        v-if="activeNode"
        :key="connectionKey"
        :node="activeNode"
      />
      <div
        v-else
        class="node-shell-page__empty"
      >
        <q-icon
          name="terminal"
          size="44px"
          color="grey-5"
        />
        <div>{{ gettext('Select an online node and connect to its Shell.') }}</div>
      </div>
    </q-card>
  </q-page>
  <q-page
    v-else
    class="placeholder-page"
  >
    <div class="page-title-row">
      <div>
        <h1>{{ gettext('Module') }}</h1>
        <p>{{ gettext('This module route is ready for phased migration.') }}</p>
      </div>
    </div>
    <q-card
      flat
      bordered
      class="placeholder-card"
    >
      <q-card-section>
        <q-icon
          name="schema"
          size="32px"
          color="primary"
        />
        <div>
          <div class="placeholder-title">{{ gettext('Framework placeholder') }}</div>
          <div class="placeholder-desc">
            {{
              gettext(
                'Business pages will be migrated after login, layout, request and permission contracts are stable.'
              )
            }}
          </div>
        </div>
      </q-card-section>
    </q-card>
  </q-page>
</template>

<style scoped lang="scss">
.node-shell-page {
  min-height: calc(100vh - 100px);
}
.node-shell-page__terminal {
  overflow: hidden;
}
.node-shell-page__empty {
  display: grid;
  min-height: 520px;
  place-content: center;
  justify-items: center;
  gap: 12px;
  color: #757575;
}
</style>
