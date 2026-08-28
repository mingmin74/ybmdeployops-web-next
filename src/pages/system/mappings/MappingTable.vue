<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { Dialog } from 'quasar';
import { computed, onMounted, reactive, shallowRef, watch } from 'vue';
import {
  deleteDeviceMapping,
  getDeviceMapping,
  getDirectoryMappings,
  getPciMappings,
  getUsbMappings,
  saveDeviceMapping,
} from '@/api/deviceMapping';
import { getNodes } from '@/api/host';
import type { PveRecord } from '@/api/resources';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';
import { useSessionStore } from '@/stores/session';
import { textValue } from '@/utils/pveFormat';
import PciMappingEditor from './PciMappingEditor.vue';
import UsbMappingEditor from './UsbMappingEditor.vue';

type MappingKind = 'pci' | 'usb' | 'dir';
type DirectoryEditMode = 'create' | 'add-node' | 'edit-node' | 'edit-comment';
type DirectoryRowType = 'entry' | 'node' | 'map';
type ResourceEditMode = 'create' | 'add-node' | 'edit-entry' | 'edit-node';

const props = defineProps<{ kind: MappingKind; title: string }>();
const rows = defineModel<PveRecord[]>('rows', { default: () => [] });
const session = useSessionStore();
const selected = shallowRef<PveRecord[]>([]);
const nodes = shallowRef<PveRecord[]>([]);
const loading = shallowRef(false);
const saving = shallowRef(false);
const directorySubmitted = shallowRef(false);
const editorVisible = shallowRef(false);
const editingId = shallowRef<string>();
const editingNode = shallowRef('');
const directoryEditMode = shallowRef<DirectoryEditMode>('create');
const directoryDetail = shallowRef<PveRecord>();
const resourceEditMode = shallowRef<ResourceEditMode>('create');
const resourceDetail = shallowRef<PveRecord>();
const resourceEditorRef = shallowRef<{ submit: () => void }>();
const form = reactive({
  id: '',
  node: '',
  path: '',
  deviceId: '',
  description: '',
  mdev: false,
  liveMigration: false,
});

const isDirectory = computed(() => props.kind === 'dir');
const canConfigure = computed(() =>
  Boolean((session.caps.mapping as Record<string, unknown> | undefined)?.['Mapping.Modify'])
);
const configuredNodes = computed(
  () =>
    new Set(
      mapValues(isDirectory.value ? directoryDetail.value : resourceDetail.value).map((raw) =>
        textValue(parseMap(raw).node)
      )
    )
);
const nodeOptions = computed(() =>
  nodes.value.map((node) => {
    const value = textValue(node.node);
    return {
      label: value,
      value,
      disable:
        ((isDirectory.value && directoryEditMode.value === 'add-node') ||
          (!isDirectory.value && resourceEditMode.value === 'add-node')) &&
        configuredNodes.value.has(value),
    };
  })
);
const pathError = computed(() => {
  if (!isDirectory.value || !form.path.trim()) return '';
  return isValidDirectoryPath(form.path.trim())
    ? ''
    : gettext(
        'Value does not look like a valid absolute path. These symbols are currently not allowed in path: ;,=()'
      );
});
const canSave = computed(() => {
  if (isDirectory.value) {
    if (directoryEditMode.value === 'edit-comment') return Boolean(form.id.trim());
    return Boolean(form.id.trim() && form.node && form.path.trim() && !pathError.value);
  }
  return Boolean(form.id.trim() && form.node && form.deviceId.trim());
});
const canEditSelected = computed(
  () => selected.value.length === 1 && selected.value[0]?.type !== 'map'
);

const columns = computed<QTableColumn<PveRecord>[]>(() => {
  if (isDirectory.value) {
    return [
      {
        name: 'name',
        label: gettext('ID/Node'),
        field: (row) => textValue(row.text),
        align: 'left',
      },
      {
        name: 'description',
        label: gettext('Comment'),
        field: (row) => (row.type === 'entry' ? textValue(row.description ?? row.comment) : ''),
        align: 'left',
      },
      { name: 'actions', label: gettext('Actions'), field: () => '', align: 'right' },
    ];
  }
  const base: QTableColumn<PveRecord>[] = [
    {
      name: 'tree',
      label: props.kind === 'pci' ? gettext('ID/Node/Path') : gettext('ID/Node/Vendor&Device'),
      field: (row) => textValue(row.text),
      align: 'left',
    },
  ];
  if (props.kind === 'pci')
    base.push(
      {
        name: 'device-id',
        label: gettext('Vendor/Device'),
        field: (row) => (row.type === 'map' ? textValue(row.id) : ''),
        align: 'left',
      },
      {
        name: 'subsystem-id',
        label: gettext('Subsystem Vendor/Device'),
        field: (row) => (row.type === 'map' ? textValue(row['subsystem-id']) : ''),
        align: 'left',
      },
      {
        name: 'iommugroup',
        label: gettext('IOMMU-Group'),
        field: (row) => (row.type === 'map' ? textValue(row.iommugroup) : ''),
        align: 'left',
      }
    );
  if (props.kind === 'usb')
    base.push({
      name: 'path',
      label: gettext('Path'),
      field: (row) => (row.type === 'map' ? textValue(row.path) : ''),
      align: 'left',
    });
  base.push({
    name: 'status',
    label: gettext('Status'),
    field: (row) => statusText(row),
    align: 'left',
  });
  base.push({
    name: 'description',
    label: gettext('Comment'),
    field: (row) => (row.type === 'entry' ? textValue(row.description) : ''),
    align: 'left',
  });
  base.push({ name: 'actions', label: gettext('Actions'), field: () => '', align: 'right' });
  return base;
});

function mapValues(value?: PveRecord) {
  return Array.isArray(value?.map) ? value.map : [];
}

function parseMap(value: unknown) {
  return textValue(value)
    .split(',')
    .reduce<PveRecord>((result, part) => {
      const index = part.indexOf('=');
      if (index > 0) result[part.slice(0, index)] = part.slice(index + 1);
      return result;
    }, {});
}

function printMap(value: PveRecord) {
  return Object.entries(value)
    .filter(([, item]) => item !== '' && item !== undefined && item !== false)
    .map(([key, item]) => `${key}=${textValue(item)}`)
    .join(',');
}

function isValidDirectoryPath(path: string) {
  return /^\/[^;,=()]+$/.test(path);
}

function makeDirectoryRows(entries: PveRecord[]) {
  return entries.flatMap((entry) => {
    const id = textValue(entry.id);
    const childrenByNode = new Map<string, PveRecord[]>();
    mapValues(entry).forEach((raw, index) => {
      const map = parseMap(raw);
      const node = textValue(map.node);
      const children = childrenByNode.get(node) || [];
      children.push({
        ...map,
        internalId: `${id}:map:${node}:${textValue(map.path)}:${index}`,
        name: id,
        text: textValue(map.path),
        type: 'map' satisfies DirectoryRowType,
      });
      childrenByNode.set(node, children);
    });
    const entryRow: PveRecord = {
      ...entry,
      internalId: `${id}:entry`,
      name: id,
      text: id,
      type: 'entry' satisfies DirectoryRowType,
    };
    const nodeRows = [...childrenByNode.entries()].flatMap(([node, children]) => [
      {
        internalId: `${id}:node:${node}`,
        name: id,
        node,
        text: node,
        type: 'node' satisfies DirectoryRowType,
      },
      ...children,
    ]);
    return [entryRow, ...nodeRows];
  });
}

function makeResourceRows(entries: PveRecord[]) {
  return entries.flatMap((entry) => {
    const id = textValue(entry.id);
    const childrenByNode = new Map<string, PveRecord[]>();
    mapValues(entry).forEach((raw, index) => {
      const map = parseMap(raw);
      const node = textValue(map.node);
      const children = childrenByNode.get(node) || [];
      children.push({
        ...map,
        mdev: entry.mdev ?? 0,
        name: id,
        text: props.kind === 'pci' ? textValue(map.path) : textValue(map.id),
        type: 'map',
        internalId: `${id}:map:${node}:${textValue(map.path || map.id)}:${index}`,
      });
      childrenByNode.set(node, children);
    });
    return [
      { ...entry, name: id, text: id, type: 'entry', internalId: `${id}:entry` },
      ...[...childrenByNode.entries()].flatMap(([node, children]) => [
        { name: id, node, text: node, type: 'node', internalId: `${id}:node:${node}` },
        ...children,
      ]),
    ];
  });
}

function statusText(row: PveRecord) {
  if (row.type !== 'map') return '';
  if (row.loading) return gettext('Loading...');
  if (row.valid === undefined) return gettext('Unknown Node');
  return row.valid ? gettext('Mapping matches host data') : textValue(row.errmsg);
}

async function reload() {
  loading.value = true;
  try {
    if (isDirectory.value) {
      const response = await getDirectoryMappings();
      rows.value = makeDirectoryRows(response.data || []);
    } else {
      const loader = props.kind === 'pci' ? getPciMappings : getUsbMappings;
      const response = await loader();
      rows.value = makeResourceRows(response.data || []);
      void loadResourceStatus(response.data || []);
    }
    selected.value = [];
  } finally {
    loading.value = false;
  }
}

async function loadNodes() {
  nodes.value = (await getNodes()).data || [];
}

function reset() {
  directorySubmitted.value = false;
  Object.assign(form, {
    id: '',
    node: '',
    path: '',
    deviceId: '',
    description: '',
    mdev: false,
    liveMigration: false,
  });
}

function add() {
  editingId.value = undefined;
  editingNode.value = '';
  directoryDetail.value = undefined;
  directoryEditMode.value = 'create';
  resourceEditMode.value = 'create';
  resourceDetail.value = undefined;
  reset();
  editorVisible.value = true;
}

async function openDirectoryEditor(mode: DirectoryEditMode, id: string, node = '') {
  reset();
  editingId.value = id;
  editingNode.value = node;
  directoryEditMode.value = mode;
  const data = (await getDeviceMapping('dir', id)).data || {};
  directoryDetail.value = data;
  Object.assign(form, { id, description: textValue(data.description) });
  if (mode === 'edit-node') {
    const map =
      mapValues(data)
        .map(parseMap)
        .find((item) => textValue(item.node) === node) || {};
    Object.assign(form, { node, path: textValue(map.path) });
  }
  editorVisible.value = true;
}

async function addNode(row: PveRecord) {
  if (!canConfigure.value || allNodesMapped(row)) return;
  if (!isDirectory.value) {
    editingId.value = textValue(row.name);
    editingNode.value = '';
    resourceDetail.value = (await getDeviceMapping(props.kind, editingId.value)).data || {};
    resourceEditMode.value = 'add-node';
    editorVisible.value = true;
    return;
  }
  await openDirectoryEditor('add-node', textValue(row.name));
}

async function editRow(row?: PveRecord) {
  const target = row || selected.value[0];
  if (!target || !canConfigure.value || (isDirectory.value && target.type === 'map')) return;
  if (isDirectory.value) {
    await openDirectoryEditor(
      target.type === 'entry' ? 'edit-comment' : 'edit-node',
      textValue(target.name),
      textValue(target.node)
    );
    return;
  }
  editingId.value = textValue(target.name);
  editingNode.value = textValue(target.node);
  resourceDetail.value = (await getDeviceMapping(props.kind, editingId.value)).data || {};
  resourceEditMode.value = target.type === 'entry' ? 'edit-entry' : 'edit-node';
  editorVisible.value = true;
}

async function saveDirectory() {
  const existing = directoryDetail.value;
  const description = form.description.trim();
  const map = { node: form.node, path: form.path.trim() };
  let payload: PveRecord;

  if (directoryEditMode.value === 'create') {
    payload = { id: form.id.trim(), map: [printMap(map)] };
    if (description) payload.description = description;
    await saveDeviceMapping('dir', undefined, payload);
  } else {
    const originalMap = mapValues(existing);
    payload = { map: originalMap, ...(existing?.digest ? { digest: existing.digest } : {}) };
    if (directoryEditMode.value === 'add-node') payload.map = [...originalMap, printMap(map)];
    if (directoryEditMode.value === 'edit-node')
      payload.map = [
        ...originalMap.filter((raw) => textValue(parseMap(raw).node) !== editingNode.value),
        printMap(map),
      ];
    if (directoryEditMode.value === 'edit-comment') {
      if (description) payload.description = description;
      else if (textValue(existing?.description)) payload.delete = 'description';
    }
    await saveDeviceMapping('dir', editingId.value, payload);
  }
}

async function save() {
  if (isDirectory.value) directorySubmitted.value = true;
  if (!canSave.value || !canConfigure.value) return;
  saving.value = true;
  try {
    if (isDirectory.value) {
      await saveDirectory();
    }
    editorVisible.value = false;
    await reload();
  } finally {
    saving.value = false;
  }
}

async function saveResource(value: {
  id: string;
  node: string;
  maps?: PveRecord[];
  map?: PveRecord;
  description: string;
  mdev?: boolean;
  liveMigration?: boolean;
}) {
  if (!canConfigure.value) return;
  saving.value = true;
  try {
    const existing = resourceDetail.value;
    const newMaps = value.maps || (value.map ? [value.map] : []);
    let map = mapValues(existing);
    if (resourceEditMode.value !== 'edit-entry')
      map = [
        ...map.filter((raw) => textValue(parseMap(raw).node) !== value.node),
        ...newMaps.map(printMap),
      ];
    const payload: PveRecord = { map, ...(existing?.digest ? { digest: existing.digest } : {}) };
    if (resourceEditMode.value === 'create' || resourceEditMode.value === 'edit-entry') {
      if (value.description) payload.description = value.description;
      else if (textValue(existing?.description)) payload.delete = 'description';
      if (props.kind === 'pci') {
        payload.mdev = value.mdev ? 1 : 0;
        payload['live-migration-capable'] = value.liveMigration ? 1 : 0;
      }
    }
    await saveDeviceMapping(
      props.kind,
      resourceEditMode.value === 'create' ? undefined : value.id,
      resourceEditMode.value === 'create' ? { ...payload, id: value.id } : payload
    );
    editorVisible.value = false;
    await reload();
  } finally {
    saving.value = false;
  }
}

async function loadResourceStatus(entries: PveRecord[]) {
  const nodeNames = new Set<string>();
  entries.forEach((entry) =>
    mapValues(entry).forEach((raw) => nodeNames.add(textValue(parseMap(raw).node)))
  );
  nodeNames.forEach((node) =>
    rows.value.forEach((row) => {
      if (textValue(row.node) === node) row.loading = true;
    })
  );
  rows.value = [...rows.value];
  const { getNodePciDevices, getNodeUsbDevices } = await import('@/api/host');
  await Promise.all(
    [...nodeNames].map(async (node) => {
      try {
        const hardware = ((
          await (props.kind === 'pci' ? getNodePciDevices(node) : getNodeUsbDevices(node))
        ).data || []) as PveRecord[];
        rows.value.forEach((row) => {
          if (row.type === 'map' && textValue(row.node) === node)
            validateResourceMap(row, hardware);
        });
      } catch (error) {
        rows.value.forEach((row) => {
          if (row.type === 'map' && textValue(row.node) === node) {
            row.loading = false;
            row.valid = false;
            row.errmsg = error instanceof Error ? error.message : gettext('Unknown Node');
          }
        });
      }
    })
  );
  rows.value = [...rows.value];
}

function validateResourceMap(row: PveRecord, hardware: PveRecord[]) {
  row.loading = false;
  if (props.kind === 'usb') {
    const device = row.path
      ? hardware.find(
          (item) => `${textValue(item.busnum)}-${textValue(item.usbpath)}` === textValue(row.path)
        )
      : hardware.find(
          (item) =>
            `${textValue(item.vendid)}:${textValue(item.prodid)}`.replace(/0x/g, '') ===
            textValue(row.id)
        );
    row.valid =
      Boolean(device) &&
      `${textValue(device?.vendid)}:${textValue(device?.prodid)}`.replace(/0x/g, '') ===
        textValue(row.id);
    row.errmsg = row.valid
      ? ''
      : device
      ? gettext("Configuration for 'id' not correct")
      : gettext('Cannot find USB device %s').replace('%s', textValue(row.id));
    return;
  }
  const path = textValue(row.path).match(/\.\d$/)
    ? textValue(row.path)
    : `${textValue(row.path)}.0`;
  const device = hardware.find((item) => textValue(item.id) === path);
  if (!device) {
    row.valid = false;
    row.errmsg = gettext('Cannot find PCI id %s').replace('%s', path);
    return;
  }
  const checks: Record<string, string> = {
    id: `${textValue(device.vendor)}:${textValue(device.device)}`.replace(/0x/g, ''),
    'subsystem-id': `${textValue(device.subsystem_vendor)}:${textValue(
      device.subsystem_device
    )}`.replace(/0x/g, ''),
    mdev: textValue(device.mdev || 0),
    iommugroup: Number(device.iommugroup) === -1 ? '' : textValue(device.iommugroup),
  };
  const errors = Object.entries(checks)
    .filter(([key, actual]) => textValue(row[key]) !== actual)
    .map(([key]) => gettext('Configuration for %s not correct').replace('%s', key));
  row.valid = !errors.length;
  row.errmsg = errors.join('; ');
}

function directoryRemoveMessage(row: PveRecord) {
  if (row.type === 'entry')
    return gettext("Are you sure you want to remove '%s'?").replace('%s', textValue(row.name));
  if (row.type === 'node')
    return gettext("Are you sure you want to remove '%s' entries for '%s'?")
      .replace('%s', textValue(row.node))
      .replace('%s', textValue(row.name));
  return gettext("Are you sure you want to remove '%s' on '%s' for '%s'?")
    .replace('%s', textValue(row.path))
    .replace('%s', textValue(row.node))
    .replace('%s', textValue(row.name));
}

async function executeDirectoryRemove(row: PveRecord) {
  const id = textValue(row.name);
  if (row.type === 'entry') {
    await deleteDeviceMapping('dir', id);
    await reload();
    return;
  }
  const existing = (await getDeviceMapping('dir', id)).data || {};
  const map = mapValues(existing).filter((raw) => {
    const value = parseMap(raw);
    if (row.type === 'node') return textValue(value.node) !== textValue(row.node);
    return Object.entries(value).some(([key, item]) => textValue(row[key]) !== textValue(item));
  });
  if (map.length)
    await saveDeviceMapping('dir', id, {
      map,
      ...(existing.digest ? { digest: existing.digest } : {}),
    });
  else await deleteDeviceMapping('dir', id);
  await reload();
}

function removeRow(row?: PveRecord) {
  const target = row || selected.value[0];
  if (!target || !canConfigure.value) return;
  const message = directoryRemoveMessage(target);
  Dialog.create({ title: gettext('Confirm'), message, cancel: true, persistent: true }).onOk(
    () =>
      void (async () => {
        if (isDirectory.value) {
          await executeDirectoryRemove(target);
          return;
        }
        const id = textValue(target.name);
        const existing = (await getDeviceMapping(props.kind, id)).data || {};
        if (target.type === 'entry') {
          await deleteDeviceMapping(props.kind, id);
          await reload();
          return;
        }
        const map = mapValues(existing).filter((raw) => {
          const value = parseMap(raw);
          if (target.type === 'node') return textValue(value.node) !== textValue(target.node);
          return Object.entries(value).some(
            ([key, item]) => textValue(target[key]) !== textValue(item)
          );
        });
        if (map.length)
          await saveDeviceMapping(props.kind, id, {
            map,
            ...(existing.digest ? { digest: existing.digest } : {}),
          });
        else await deleteDeviceMapping(props.kind, id);
        await reload();
      })()
  );
}

function allNodesMapped(row: PveRecord) {
  if (!nodes.value.length) return false;
  const configured = new Set(mapValues(row).map((raw) => textValue(parseMap(raw).node)));
  return configured.size >= nodes.value.length;
}

watch(
  () => props.kind,
  () => void reload()
);
onMounted(() => {
  void reload();
  void loadNodes();
});
</script>

<template>
  <q-table
    flat
    row-key="internalId"
    selection="single"
    table-header-class="u-table-header"
    :rows="rows"
    :columns="columns"
    :selected="selected"
    :loading="loading"
    :pagination="{ rowsPerPage: 0 }"
    :rows-per-page-options="[0]"
    hide-bottom
    :no-data-label="gettext('No Mapping found')"
    @update:selected="selected = [...$event]"
    @row-dblclick="(_, row) => void editRow(row)"
  >
    <template #top>
      <div class="row q-gutter-sm">
        <q-btn
          no-caps
          outline
          size="12px"
          color="primary"
          class="u-button"
          :disable="!canConfigure"
          :label="gettext('Add')"
          @click="add"
        />
        <q-btn
          no-caps
          outline
          size="12px"
          color="primary"
          class="u-button"
          :disable="!canConfigure || !canEditSelected"
          :label="gettext('Edit')"
          @click="() => void editRow()"
        />
        <q-btn
          no-caps
          outline
          size="12px"
          class="u-button"
          :color="canConfigure && selected.length === 1 ? 'red' : 'grey'"
          :disable="!canConfigure || selected.length !== 1"
          :label="gettext('Remove')"
          @click="() => removeRow()"
        />
        <q-space />
        <q-btn
          no-caps
          outline
          size="12px"
          color="primary"
          class="u-button"
          :label="gettext('Reload')"
          @click="reload"
        />
      </div>
    </template>
    <template
      v-if="isDirectory"
      #body-cell-name="slotProps"
    >
      <q-td :props="slotProps">
        <div
          :class="
            slotProps.row.type === 'node'
              ? 'q-pl-md'
              : slotProps.row.type === 'map'
              ? 'q-pl-xl'
              : ''
          "
        >
          <q-icon
            :name="
              slotProps.row.type === 'entry'
                ? 'folder_open'
                : slotProps.row.type === 'node'
                ? 'dns'
                : 'folder'
            "
            size="16px"
            class="q-mr-sm"
          />
          {{ slotProps.value }}
        </div>
      </q-td>
    </template>
    <template
      v-else
      #body-cell-tree="slotProps"
    >
      <q-td :props="slotProps">
        <div
          :class="
            slotProps.row.type === 'node'
              ? 'q-pl-md'
              : slotProps.row.type === 'map'
              ? 'q-pl-xl'
              : ''
          "
        >
          <q-icon
            :name="
              slotProps.row.type === 'entry'
                ? 'folder_open'
                : slotProps.row.type === 'node'
                ? 'dns'
                : kind === 'pci'
                ? 'memory'
                : 'usb'
            "
            size="16px"
            class="q-mr-sm"
          />
          {{ slotProps.value }}
        </div>
      </q-td>
    </template>
    <template #body-cell-actions="slotProps">
      <q-td
        :props="slotProps"
        class="q-gutter-xs"
      >
        <q-btn
          v-if="slotProps.row.type === 'entry' && !allNodesMapped(slotProps.row)"
          flat
          round
          dense
          size="sm"
          icon="add"
          :disable="!canConfigure"
          @click="() => void addNode(slotProps.row)"
        >
          <q-tooltip>
            {{
              gettext("Add new host mapping for '%s'").replace('%s', textValue(slotProps.row.name))
            }}
          </q-tooltip>
        </q-btn>
        <q-btn
          v-if="slotProps.row.type !== 'map'"
          flat
          round
          dense
          size="sm"
          icon="edit"
          :disable="!canConfigure"
          @click="() => void editRow(slotProps.row)"
        >
          <q-tooltip>{{ gettext('Edit') }}</q-tooltip>
        </q-btn>
        <q-btn
          flat
          round
          dense
          size="sm"
          color="negative"
          icon="delete"
          :disable="!canConfigure"
          @click="removeRow(slotProps.row)"
        >
          <q-tooltip>{{ gettext('Remove') }}</q-tooltip>
        </q-btn>
      </q-td>
    </template>
  </q-table>
  <q-dialog
    v-model="editorVisible"
    persistent
  >
    <UWindow
      v-if="!isDirectory"
      :title="`${resourceEditMode === 'create' ? gettext('Add') : gettext('Edit')}: ${gettext(
        title
      )}`"
      width="800px"
      :loading="saving"
    >
      <PciMappingEditor
        v-if="kind === 'pci'"
        ref="resourceEditorRef"
        :id="resourceEditMode === 'create' ? '' : textValue(editingId)"
        :node="resourceEditMode === 'edit-node' ? editingNode : ''"
        :nodes="nodeOptions"
        :maps="
          resourceEditMode === 'edit-node'
            ? mapValues(resourceDetail)
                .map(parseMap)
                .filter((map) => textValue(map.node) === editingNode)
            : []
        "
        :global="{
          description: textValue(resourceDetail?.description),
          mdev: Number(resourceDetail?.mdev) === 1,
          liveMigration: Number(resourceDetail?.['live-migration-capable']) === 1,
        }"
        :create="resourceEditMode === 'create'"
        :entry-only="resourceEditMode === 'edit-entry'"
        :node-locked="resourceEditMode === 'edit-node'"
        @submit="saveResource"
      />
      <UsbMappingEditor
        v-else
        ref="resourceEditorRef"
        :id="resourceEditMode === 'create' ? '' : textValue(editingId)"
        :node="resourceEditMode === 'edit-node' ? editingNode : ''"
        :nodes="nodeOptions"
        :map="
          resourceEditMode === 'edit-node'
            ? mapValues(resourceDetail)
                .map(parseMap)
                .find((map) => textValue(map.node) === editingNode)
            : undefined
        "
        :description="textValue(resourceDetail?.description)"
        :create="resourceEditMode === 'create'"
        :entry-only="resourceEditMode === 'edit-entry'"
        :node-locked="resourceEditMode === 'edit-node'"
        @submit="saveResource"
      />
      <template #foot>
        <q-btn
          v-close-popup
          no-caps
          outline
          size="12px"
          class="u-button"
          :label="gettext('Cancel')"
        />
        <q-btn
          no-caps
          flat
          size="12px"
          class="bg-primary text-grey-1 u-button"
          :disable="!canConfigure"
          :label="resourceEditMode === 'create' ? gettext('Create') : gettext('OK')"
          @click="resourceEditorRef?.submit()"
        />
      </template>
    </UWindow>
    <UWindow
      v-if="isDirectory"
      :title="`${
        isDirectory
          ? directoryEditMode === 'create'
            ? gettext('Add')
            : gettext('Edit')
          : !editingId
          ? gettext('Add')
          : gettext('Edit')
      }: ${gettext(title)}`"
      width="500px"
      :loading="saving"
    >
      <div class="q-pa-sm u-dense">
        <div class="u-border q-pa-md">
          <q-input
            v-model="form.id"
            dense
            class="q-field--with-bottom"
            :disable="Boolean(editingId)"
            :label="`${gettext('Name')} *`"
            :error="directorySubmitted && !form.id.trim()"
            :error-message="gettext('This field is required')"
          />
          <template v-if="!isDirectory || directoryEditMode !== 'edit-comment'">
            <q-select
              v-if="!isDirectory || directoryEditMode !== 'edit-node'"
              v-model="form.node"
              dense
              class="q-field--with-bottom"
              emit-value
              map-options
              :options="nodeOptions"
              :label="`${gettext('Mapping on Node')} *`"
              :error="directorySubmitted && !form.node"
              :error-message="gettext('This field is required')"
            />
            <q-input
              v-else
              :model-value="form.node"
              dense
              class="q-field--with-bottom"
              disable
              :label="`${gettext('Node')} *`"
            />
            <q-input
              v-if="kind === 'dir'"
              v-model="form.path"
              dense
              class="q-field--with-bottom"
              :label="`${gettext('Path')} *`"
              hint="Make sure the directory exists."
              :error="directorySubmitted && (!form.path.trim() || Boolean(pathError))"
              :error-message="
                !form.path.trim() ? gettext('This field is required') : pathError
              "
            />
            <q-input
              v-else
              v-model="form.deviceId"
              dense
              class="q-field--with-bottom"
              :label="kind === 'pci' ? gettext('PCI Device') : gettext('USB Vendor/Device or Port')"
              :hint="kind === 'usb' ? gettext('Use vendor:device or bus-port') : ''"
            />
            <q-checkbox
              v-if="kind === 'pci'"
              v-model="form.mdev"
              dense
              :label="gettext('Use with Mediated Devices')"
            />
            <q-checkbox
              v-if="kind === 'pci'"
              v-model="form.liveMigration"
              dense
              :label="gettext('Live Migration Capable')"
            />
          </template>
          <q-input
            v-if="
              !isDirectory || directoryEditMode === 'create' || directoryEditMode === 'edit-comment'
            "
            v-model="form.description"
            dense
            class="q-field--with-bottom"
            :label="gettext('Comment')"
          />
        </div>
      </div>
      <template #foot>
        <q-btn
          v-close-popup
          no-caps
          outline
          size="12px"
          class="u-button"
          :label="gettext('Cancel')"
        />
        <q-btn
          no-caps
          flat
          size="12px"
          class="bg-primary text-grey-1 u-button"
          :disable="!canConfigure"
          :label="
            isDirectory
              ? directoryEditMode === 'create'
                ? gettext('Create')
                : gettext('OK')
              : !editingId
              ? gettext('Create')
              : gettext('OK')
          "
          @click="() => void save()"
        />
      </template>
    </UWindow>
  </q-dialog>
</template>
