<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed, shallowRef } from 'vue';
import { gettext } from '@/locale';
import { useCreateCtWizardContext } from './create-ct/context/createCtWizardContext';
import type { CtIdMap, CtManagedMount } from './create-ct/types/createCtWizard';

defineOptions({ name: 'CtHardwareStep' });

const { form, resources, errors } = useCreateCtWizardContext();
const { validationErrors } = errors;
const diskSplitter = shallowRef(28);
const activeDiskId = shallowRef('rootfs');
const activeManagedMount = computed(() =>
  form.managedMounts.find((mount) => mount.id === activeDiskId.value),
);
const mountOptionChoices = ['discard', 'lazytime', 'noatime', 'nodev', 'noexec', 'nosuid'];
const rootMountOptionChoices = mountOptionChoices.filter(
  (option) => option !== 'nodev' && option !== 'noexec',
);
const aclOptions = [
  { label: gettext('Default'), value: '__default__' },
  { label: gettext('Enabled'), value: '1' },
  { label: gettext('Disabled'), value: '0' },
];
const idMapColumns: QTableColumn<CtIdMap>[] = [
  { name: 'type', label: gettext('Type'), field: 'type', align: 'left' },
  { name: 'ct', label: gettext('CT'), field: 'ct', align: 'left' },
  { name: 'host', label: gettext('Host'), field: 'host', align: 'left' },
  { name: 'length', label: gettext('Length'), field: 'length', align: 'left' },
  { name: 'actions', label: '', field: () => '', align: 'right' },
];

function addManagedMount() {
  let index = 0;
  while (form.managedMounts.some((mount) => mount.id === `mp${index}`)) index += 1;
  const mount: CtManagedMount = {
    id: `mp${index}`,
    mountPoint: '',
    storage: form.rootfsStorage || resources.rootfsStorageOptions.value[0] || '',
    size: 8192,
    quota: false,
    acl: '__default__',
    backup: true,
    readOnly: false,
    skipReplication: false,
    mountOptions: [],
    idMapPassthrough: false,
    idMaps: [],
  };
  form.managedMounts.push(mount);
  activeDiskId.value = mount.id;
}
function removeManagedMount(id: string) {
  const index = form.managedMounts.findIndex((mount) => mount.id === id);
  if (index >= 0) form.managedMounts.splice(index, 1);
  activeDiskId.value = 'rootfs';
}
function addIdMap(rows: CtIdMap[]) {
  rows.push({ type: 'u', ct: '', host: '', length: '' });
}
function removeIdMap(rows: CtIdMap[], index: number) {
  rows.splice(index, 1);
}
</script>

<template>
  <q-scroll-area class="q-pa-sm" style="height: 466px">
    <q-splitter v-model="diskSplitter" unit="%" class="u-border-dotted-blue bg-white ct-disk-panel">
      <template #before>
        <div class="q-pa-sm ct-disk-nav">
          <q-btn
            no-caps
            flat
            size="sm"
            class="bg-primary text-grey-1 u-button full-width q-mb-sm"
            @click="addManagedMount"
            ><q-icon name="add_circle" size="14px" /><span class="q-ml-xs">{{
              gettext('Add')
            }}</span></q-btn
          >
          <q-list dense bordered separator class="ct-disk-list">
            <q-item
              clickable
              :active="activeDiskId === 'rootfs'"
              active-class="bg-blue-1 text-primary"
              @click="activeDiskId = 'rootfs'"
              ><q-item-section>rootfs</q-item-section></q-item
            >
            <q-item
              v-for="mount in form.managedMounts"
              :key="mount.id"
              clickable
              :active="activeDiskId === mount.id"
              active-class="bg-blue-1 text-primary"
              @click="activeDiskId = mount.id"
              ><q-item-section>{{ mount.id }}</q-item-section
              ><q-item-section side
                ><q-icon
                  name="remove_circle"
                  class="ct-disk-remove"
                  @click.stop="removeManagedMount(mount.id)" /></q-item-section
            ></q-item>
          </q-list>
        </div>
      </template>
      <template #after>
        <div class="q-pa-sm ct-disk-detail">
          <div class="q-pa-md bg-white ct-disk-editor">
            <template v-if="activeDiskId === 'rootfs'">
              <div class="row q-gutter-lg">
                <q-select
                  v-model="form.rootfsStorage"
                  :options="
                    resources.rootfsStorageOptions.value.map((storage) => ({
                      label: storage,
                      value: storage,
                    }))
                  "
                  :error="Boolean(validationErrors.rootfsStorage)"
                  :error-message="validationErrors.rootfsStorage"
                  dense
                  options-dense
                  emit-value
                  map-options
                  class="col q-field--with-bottom"
                  :label="gettext('Storage')"
                />
                <q-input
                  v-model.number="form.rootfsSize"
                  :error="Boolean(validationErrors.rootfsSize)"
                  :error-message="validationErrors.rootfsSize"
                  dense
                  type="number"
                  min="1"
                  class="col q-field--with-bottom"
                  :label="`${gettext('Disk size')} (MiB)`"
                />
              </div>
              <q-separator class="q-my-md" />
              <div class="row q-gutter-lg">
                <q-checkbox
                  v-model="form.rootfsQuota"
                  dense
                  right-label
                  color="primary"
                  class="col"
                  :label="gettext('Enable quota')"
                />
                <q-select
                  v-model="form.rootfsAcl"
                  dense
                  options-dense
                  emit-value
                  map-options
                  class="col q-field--with-bottom"
                  :options="aclOptions"
                  label="ACLs"
                />
              </div>
              <div class="row q-gutter-lg">
                <q-checkbox
                  v-model="form.rootfsSkipReplication"
                  dense
                  right-label
                  color="primary"
                  class="col"
                  :label="gettext('Skip replication')"
                />
                <q-select
                  v-model="form.rootfsMountOptions"
                  multiple
                  use-chips
                  dense
                  options-dense
                  class="col q-field--with-bottom"
                  :options="rootMountOptionChoices"
                  :label="gettext('Mount options')"
                />
              </div>
              <div class="q-mt-md">
                <div class="text-body2 q-mb-sm">{{ gettext('ID Mapping') }}</div>
                <q-checkbox
                  v-model="form.rootfsIdMapPassthrough"
                  dense
                  right-label
                  color="primary"
                  :label="gettext('Passthrough')"
                /><q-table
                  v-if="!form.rootfsIdMapPassthrough"
                  flat
                  bordered
                  dense
                  hide-bottom
                  :rows="form.rootfsIdMaps"
                  :columns="idMapColumns"
                  row-key="ct"
                  class="q-mt-sm"
                  ><template #body="scope"
                    ><q-tr :props="scope"
                      ><q-td
                        ><q-select
                          v-model="scope.row.type"
                          dense
                          options-dense
                          emit-value
                          map-options
                          :options="[
                            { label: 'UID', value: 'u' },
                            { label: 'GID', value: 'g' },
                          ]" /></q-td
                      ><q-td
                        ><q-input
                          v-model="scope.row.ct"
                          dense
                          type="number"
                          placeholder="CT" /></q-td
                      ><q-td
                        ><q-input
                          v-model="scope.row.host"
                          dense
                          type="number"
                          placeholder="Host" /></q-td
                      ><q-td
                        ><q-input
                          v-model="scope.row.length"
                          dense
                          type="number"
                          placeholder="Length" /></q-td
                      ><q-td auto-width
                        ><q-btn
                          flat
                          round
                          dense
                          icon="delete"
                          color="negative"
                          @click="
                            removeIdMap(form.rootfsIdMaps, scope.rowIndex)
                          " /></q-td></q-tr></template></q-table
                ><q-btn
                  v-if="!form.rootfsIdMapPassthrough"
                  no-caps
                  flat
                  size="12px"
                  color="primary"
                  class="u-button q-mt-sm"
                  :label="gettext('Add')"
                  @click="addIdMap(form.rootfsIdMaps)"
                />
              </div>
            </template>
            <template v-else-if="activeManagedMount">
              <div class="row q-gutter-lg">
                <q-select
                  v-model="activeManagedMount.storage"
                  :options="
                    resources.rootfsStorageOptions.value.map((storage) => ({
                      label: storage,
                      value: storage,
                    }))
                  "
                  dense
                  options-dense
                  emit-value
                  map-options
                  class="col q-field--with-bottom"
                  :label="gettext('Storage')"
                /><q-input
                  v-model.number="activeManagedMount.size"
                  dense
                  type="number"
                  min="1"
                  class="col q-field--with-bottom"
                  :label="`${gettext('Disk size')} (MiB)`"
                />
              </div>
              <q-input
                v-model="activeManagedMount.mountPoint"
                dense
                class="q-field--with-bottom"
                :label="gettext('Mount Point')"
                placeholder="/mnt/data"
              />
              <q-separator class="q-my-md" />
              <div class="row q-gutter-lg">
                <q-checkbox
                  v-model="activeManagedMount.quota"
                  dense
                  right-label
                  color="primary"
                  class="col"
                  :label="gettext('Enable quota')"
                /><q-select
                  v-model="activeManagedMount.acl"
                  dense
                  options-dense
                  emit-value
                  map-options
                  class="col q-field--with-bottom"
                  :options="aclOptions"
                  label="ACLs"
                />
              </div>
              <div class="row q-gutter-lg">
                <q-checkbox
                  v-model="activeManagedMount.skipReplication"
                  dense
                  right-label
                  color="primary"
                  class="col"
                  :label="gettext('Skip replication')"
                /><q-select
                  v-model="activeManagedMount.mountOptions"
                  multiple
                  use-chips
                  dense
                  options-dense
                  class="col q-field--with-bottom"
                  :options="mountOptionChoices"
                  :label="gettext('Mount options')"
                />
              </div>
              <div class="q-mt-md">
                <div class="text-body2 q-mb-sm">{{ gettext('ID Mapping') }}</div>
                <q-checkbox
                  v-model="activeManagedMount.idMapPassthrough"
                  dense
                  right-label
                  color="primary"
                  :label="gettext('Passthrough')"
                /><q-table
                  v-if="!activeManagedMount.idMapPassthrough"
                  flat
                  bordered
                  dense
                  hide-bottom
                  :rows="activeManagedMount.idMaps"
                  :columns="idMapColumns"
                  row-key="ct"
                  class="q-mt-sm"
                  ><template #body="scope"
                    ><q-tr :props="scope"
                      ><q-td
                        ><q-select
                          v-model="scope.row.type"
                          dense
                          options-dense
                          emit-value
                          map-options
                          :options="[
                            { label: 'UID', value: 'u' },
                            { label: 'GID', value: 'g' },
                          ]" /></q-td
                      ><q-td
                        ><q-input
                          v-model="scope.row.ct"
                          dense
                          type="number"
                          placeholder="CT" /></q-td
                      ><q-td
                        ><q-input
                          v-model="scope.row.host"
                          dense
                          type="number"
                          placeholder="Host" /></q-td
                      ><q-td
                        ><q-input
                          v-model="scope.row.length"
                          dense
                          type="number"
                          placeholder="Length" /></q-td
                      ><q-td auto-width
                        ><q-btn
                          flat
                          round
                          dense
                          icon="delete"
                          color="negative"
                          @click="
                            removeIdMap(activeManagedMount.idMaps, scope.rowIndex)
                          " /></q-td></q-tr></template></q-table
                ><q-btn
                  v-if="!activeManagedMount.idMapPassthrough"
                  no-caps
                  flat
                  size="12px"
                  color="primary"
                  class="u-button q-mt-sm"
                  :label="gettext('Add')"
                  @click="addIdMap(activeManagedMount.idMaps)"
                />
              </div>
            </template>
          </div>
        </div>
      </template>
    </q-splitter>
  </q-scroll-area>
</template>

<style scoped>
.ct-disk-panel {
  height: 450px;
}
.ct-disk-nav,
.ct-disk-detail {
  min-width: 0;
}
.ct-disk-list :deep(.q-item) {
  min-height: 30px;
  padding: 3px 8px;
}
.ct-disk-remove {
  color: #555;
  cursor: pointer;
  font-size: 14px;
}
@media (max-width: 599px) {
  .ct-disk-panel > .row {
    flex-wrap: wrap;
  }
  .ct-disk-nav {
    width: 100%;
    padding-bottom: 12px;
    margin-bottom: 12px;
  }
}
</style>
