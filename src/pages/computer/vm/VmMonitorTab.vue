<script setup lang="ts">
import { computed, nextTick, onMounted, shallowRef, useTemplateRef, watch } from 'vue';
import { runVmMonitorCommand } from '@/api/vm';
import { gettext } from '@/locale';

const props = defineProps<{ node: string; vmid: string }>();

const commandLimit = 10;
const lineLimit = 5000;
const monitorCommand = shallowRef('');
const commandBlocks = shallowRef<string[][]>([[gettext("Type 'help' for help.")]]);
const history = shallowRef<string[]>([]);
const historyIndex = shallowRef(-1);
const monitorLoading = shallowRef(false);
const outputRef = useTemplateRef<HTMLDivElement>('output');
const commandInputRef = useTemplateRef<{ focus?: () => void }>('commandInput');

const monitorLines = computed(() => commandBlocks.value.flat());

function totalLineCount(blocks = commandBlocks.value) {
  return blocks.reduce((count, block) => count + block.length, 0);
}

async function scrollToEnd() {
  await nextTick();
  const output = outputRef.value;
  if (!output) return;
  output.scrollTop = output.scrollHeight - output.clientHeight;
}

async function focusCommandInput() {
  await nextTick();
  commandInputRef.value?.focus?.();
}

function recordInput(line: string) {
  const nextBlocks = [...commandBlocks.value, [line]];
  while (nextBlocks.length > commandLimit && totalLineCount(nextBlocks) > lineLimit) {
    nextBlocks.shift();
  }
  commandBlocks.value = nextBlocks;
}

function addResponse(lines: string[]) {
  const nextBlocks = commandBlocks.value.map((block) => [...block]);
  const lastBlock = nextBlocks[nextBlocks.length - 1];
  if (lastBlock) {
    lastBlock.push(...lines);
  }
  commandBlocks.value = nextBlocks;
}

function resetMonitor() {
  monitorCommand.value = '';
  commandBlocks.value = [[gettext("Type 'help' for help.")]];
  history.value = [];
  historyIndex.value = -1;
  void scrollToEnd();
  void focusCommandInput();
}

async function executeMonitorCommand() {
  if (monitorLoading.value || !props.node || !props.vmid) return;
  const command = monitorCommand.value;
  monitorCommand.value = '';
  recordInput(`# ${command}`);
  if (command) {
    history.value = [command, ...history.value].slice(0, 20);
  }
  historyIndex.value = -1;
  void scrollToEnd();
  monitorLoading.value = true;
  try {
    const response = await runVmMonitorCommand(props.node, props.vmid, command);
    const output = String(response.data || '');
    addResponse(output.split('\n'));
    void scrollToEnd();
  } catch {
    // request() already reports the PVE API error; consume it to avoid an unhandled rejection.
  } finally {
    monitorLoading.value = false;
    void focusCommandInput();
  }
}

function scrollOutput(ratio: number) {
  const output = outputRef.value;
  if (!output) return;
  output.scrollBy({ top: output.clientHeight * ratio });
}

function usePreviousHistoryCommand() {
  if (historyIndex.value + 1 >= history.value.length) return;
  historyIndex.value += 1;
  monitorCommand.value = history.value[historyIndex.value] || '';
}

function useNextHistoryCommand() {
  if (historyIndex.value <= 0) return;
  historyIndex.value -= 1;
  monitorCommand.value = history.value[historyIndex.value] || '';
}

function handleCommandKeydown(event: KeyboardEvent) {
  switch (event.key) {
    case 'Enter':
      event.preventDefault();
      void executeMonitorCommand();
      break;
    case 'PageUp':
      event.preventDefault();
      scrollOutput(-0.9);
      break;
    case 'PageDown':
      event.preventDefault();
      scrollOutput(0.9);
      break;
    case 'ArrowUp':
      event.preventDefault();
      usePreviousHistoryCommand();
      break;
    case 'ArrowDown':
      event.preventDefault();
      useNextHistoryCommand();
      break;
    default:
      break;
  }
}

watch(() => [props.node, props.vmid], resetMonitor);

onMounted(() => {
  void scrollToEnd();
  void focusCommandInput();
});
</script>

<template>
  <div class="vm-monitor-tab">
    <div
      ref="output"
      class="vm-monitor-tab__output"
    >
      <pre>{{ monitorLines.join('\n') }}</pre>
    </div>
    <q-input
      ref="commandInput"
      v-model="monitorCommand"
      dense
      square
      outlined
      class="vm-monitor-tab__command"
      input-class="text-monospace"
      :disable="monitorLoading"
      @keydown="handleCommandKeydown"
    />
    <q-inner-loading :showing="monitorLoading" />
  </div>
</template>

<style scoped>
.vm-monitor-tab {
  position: relative;
  display: flex;
  flex-direction: column;
  height: calc(100vh - 250px);
  min-height: 420px;
  padding: 5px;
  background: #fff;
}

.vm-monitor-tab__output {
  flex: 1 1 auto;
  min-height: 0;
  margin: 0 0 5px;
  overflow: auto;
  border: 1px solid #d8d8d8;
}

.vm-monitor-tab__output pre {
  margin: 0;
  padding: 8px;
  font-family: monospace;
  font-size: 12px;
  line-height: 1.45;
  color: #333;
  white-space: pre;
}

.vm-monitor-tab__command {
  flex: 0 0 auto;
}

.vm-monitor-tab__command :deep(.q-field__control),
.vm-monitor-tab__command :deep(.q-field__native) {
  min-height: 32px;
  font-family: monospace;
  font-size: 12px;
}
</style>
