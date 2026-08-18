<script setup lang="ts">
import type { QTableColumn } from 'quasar';
import { computed, shallowRef } from 'vue';
import { gettext } from '@/locale';
import { textValue } from '@/utils/pveFormat';
import { useCreateCtWizardContext } from './create-ct/context/createCtWizardContext';
import type { CtIdMap, CtManagedMount } from './create-ct/types/createCtWizard';

defineOptions({ name: 'CtHardwareStep' });

const { form, resources, errors, state, derived } = useCreateCtWizardContext();
const { validationErrors } = errors;
const { advanced } = state;
const { quotaAllowed } = derived;
const diskSplitter = shallowRef(28);
const activeDiskId = shallowRef('rootfs');
const activeManagedMount = computed(() =>
  form.managedMounts.find((mount) => mount.id === activeDiskId.value)
);
const mountOptionChoices = ['discard', 'lazytime', 'noatime', 'nodev', 'noexec', 'nosuid'];
const rootMountOptionChoices = mountOptionChoices.filter(
  (option) => option !== 'nodev' && option !== 'noexec'
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
  while (index <= 255 && form.managedMounts.some((mount) => mount.id === `mp${index}`)) index += 1;
  if (index > 255) return;
  const mount: CtManagedMount = {
    id: `mp${index}`,
    mountPoint: '',
    storage: textValue(resources.rootfsStorageOptions.value[0]?.storage),
    size: 8,
    quota: false,
    acl: '__default__',
    backup: true,
    readOnly: false,
    keepAttrs: false,
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
function clearIdMaps(rows: CtIdMap[]) {
  rows.splice(0);
}
function storageOptions() {
  return resources.rootfsStorageOptions.value.map((storage) => ({
    label: storage.type
      ? `${textValue(storage.storage)} (${textValue(storage.type)})`
      : textValue(storage.storage),
    value: textValue(storage.storage),
  }));
}
function idMapError(value: string, minimum: number) {
  return !/^\d+$/.test(value.trim()) || Number(value) < minimum;
}
</script>

<template>
  <q-scroll-area
    class="q-pa-sm"
    style="height: 466px"
  >
    <q-splitter
      v-model="diskSplitter"
      unit="%"
      class="u-border-dotted-blue bg-white ct-disk-panel"
    >
      <template #before>
        <div class="q-pa-sm ct-disk-nav">
          <q-btn
            no-caps
            flat
            size="sm"
            :disable="form.managedMounts.length >= 256"
            class="bg-primary text-grey-1 u-button full-width q-mb-sm"
            @click="addManagedMount"
          >
            <q-icon
              name="add_circle"
              size="14px"
            />
            <span class="q-ml-xs">{{ gettext('Add') }}</span>
          </q-btn>
          <q-list
            dense
            bordered
            separator
            class="ct-disk-list"
          >
            <q-item
              clickable
              :active="activeDiskId === 'rootfs'"
              active-class="bg-blue-1 text-primary"
              @click="activeDiskId = 'rootfs'"
            >
              <q-item-section>rootfs</q-item-section>
            </q-item>
            <q-item
              v-for="mount in form.managedMounts"
              :key="mount.id"
              clickable
              :active="activeDiskId === mount.id"
              active-class="bg-blue-1 text-primary"
              @click="activeDiskId = mount.id"
            >
              <q-item-section>{{ mount.id }}</q-item-section>
              <q-item-section side>
                <q-icon
                  name="remove_circle"
                  class="ct-disk-remove"
                  @click.stop="removeManagedMount(mount.id)"
                />
              </q-item-section>
            </q-item>
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
                  :options="storageOptions()"
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
                  min="0.001"
                  max="131072"
                  step="0.001"
                  class="col q-field--with-bottom"
                  :label="`${gettext('Disk size')} (GiB)`"
                />
              </div>
              <div
                v-if="advanced"
                class="q-mt-md u-border-dotted-blue q-px-md q-py-sm bg-white"
              >
                <q-separator class="q-my-md" />
                <div class="row q-gutter-lg">
                  <q-checkbox
                    v-model="form.rootfsQuota"
                    :disable="!quotaAllowed(form.rootfsStorage)"
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
                  />
                  <q-table
                    v-if="!form.rootfsIdMapPassthrough"
                    flat
                    bordered
                    dense
                    hide-bottom
                    :rows="form.rootfsIdMaps"
                    :columns="idMapColumns"
                    row-key="ct"
                    class="q-mt-sm"
                  >
                    <template #body="scope">
                      <q-tr :props="scope">
                        <q-td>
                          <q-select
                            v-model="scope.row.type"
                            dense
                            options-dense
                            emit-value
                            map-options
                            :options="[
                              { label: 'UID', value: 'u' },
                              { label: 'GID', value: 'g' },
                            ]"
                          />
                        </q-td>
                        <q-td>
                          <q-input
                            v-model="scope.row.ct"
                            dense
                            type="number"
                            min="0"
                            step="1"
                            :error="idMapError(scope.row.ct, 0)"
                            placeholder="CT"
                          />
                        </q-td>
                        <q-td>
                          <q-input
                            v-model="scope.row.host"
                            dense
                            type="number"
                            min="0"
                            step="1"
                            :error="idMapError(scope.row.host, 0)"
                            placeholder="Host"
                          />
                        </q-td>
                        <q-td>
                          <q-input
                            v-model="scope.row.length"
                            dense
                            type="number"
                            min="1"
                            step="1"
                            :error="idMapError(scope.row.length, 1)"
                            placeholder="Length"
                          />
                        </q-td>
                        <q-td auto-width>
                          <q-btn
                            flat
                            round
                            dense
                            icon="delete"
                            color="negative"
                            @click="removeIdMap(form.rootfsIdMaps, scope.rowIndex)"
                          />
                        </q-td>
                      </q-tr>
                    </template>
                  </q-table>
                  <q-btn
                    v-if="!form.rootfsIdMapPassthrough"
                    no-caps
                    flat
                    size="12px"
                    color="primary"
                    class="u-button q-mt-sm"
                    :label="gettext('Add')"
                    @click="addIdMap(form.rootfsIdMaps)"
                  />
                  <q-btn
                    v-if="!form.rootfsIdMapPassthrough"
                    no-caps
                    flat
                    size="12px"
                    color="primary"
                    class="u-button q-mt-sm q-ml-sm"
                    :label="gettext('Clear')"
                    @click="clearIdMaps(form.rootfsIdMaps)"
                  />
                </div>
              </div>
            </template>
            <template v-else-if="activeManagedMount">
              <div class="row q-gutter-lg">
                <q-select
                  v-model="activeManagedMount.storage"
                  :options="storageOptions()"
                  :error="Boolean(validationErrors[`${activeManagedMount.id}Storage`])"
                  :error-message="validationErrors[`${activeManagedMount.id}Storage`]"
                  dense
                  options-dense
                  emit-value
                  map-options
                  class="col q-field--with-bottom"
                  :label="gettext('Storage')"
                />
                <q-input
                  v-model.number="activeManagedMount.size"
                  dense
                  type="number"
                  min="0.001"
                  max="131072"
                  step="0.001"
                  :error="Boolean(validationErrors[`${activeManagedMount.id}Size`])"
                  :error-message="validationErrors[`${activeManagedMount.id}Size`]"
                  class="col q-field--with-bottom"
                  :label="`${gettext('Disk size')} (GiB)`"
                />
              </div>
              <q-input
                v-model="activeManagedMount.mountPoint"
                dense
                :error="Boolean(validationErrors[`${activeManagedMount.id}Path`])"
                :error-message="validationErrors[`${activeManagedMount.id}Path`]"
                class="q-field--with-bottom"
                :label="gettext('Mount Point')"
                placeholder="/mnt/data"
              />
              <q-checkbox
                v-model="activeManagedMount.backup"
                dense
                right-label
                color="primary"
                class="q-mt-sm"
                :label="gettext('Backup')"
              />
              <div
                v-if="advanced"
                class="q-mt-md u-border-dotted-blue q-px-md q-py-sm bg-white"
              >
                <q-separator class="q-my-md" />
                <div class="row q-gutter-lg">
                  <q-checkbox
                    v-model="activeManagedMount.quota"
                    :disable="!quotaAllowed(activeManagedMount.storage)"
                    dense
                    right-label
                    color="primary"
                    class="col"
                    :label="gettext('Enable quota')"
                  />
                  <q-select
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
                    v-model="activeManagedMount.readOnly"
                    dense
                    right-label
                    color="primary"
                    class="col"
                    :label="gettext('Read-only')"
                  />
                  <q-checkbox
                    v-model="activeManagedMount.keepAttrs"
                    dense
                    right-label
                    color="primary"
                    class="col"
                    :label="gettext('Keep Attributes')"
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
                  />
                  <q-select
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
                  />
                  <q-table
                    v-if="!activeManagedMount.idMapPassthrough"
                    flat
                    bordered
                    dense
                    hide-bottom
                    :rows="activeManagedMount.idMaps"
                    :columns="idMapColumns"
                    row-key="ct"
                    class="q-mt-sm"
                  >
                    <template #body="scope">
                      <q-tr :props="scope">
                        <q-td>
                          <q-select
                            v-model="scope.row.type"
                            dense
                            options-dense
                            emit-value
                            map-options
                            :options="[
                              { label: 'UID', value: 'u' },
                              { label: 'GID', value: 'g' },
                            ]"
                          />
                        </q-td>
                        <q-td>
                          <q-input
                            v-model="scope.row.ct"
                            dense
                            type="number"
                            min="0"
                            step="1"
                            :error="idMapError(scope.row.ct, 0)"
                            placeholder="CT"
                          />
                        </q-td>
                        <q-td>
                          <q-input
                            v-model="scope.row.host"
                            dense
                            type="number"
                            min="0"
                            step="1"
                            :error="idMapError(scope.row.host, 0)"
                            placeholder="Host"
                          />
                        </q-td>
                        <q-td>
                          <q-input
                            v-model="scope.row.length"
                            dense
                            type="number"
                            min="1"
                            step="1"
                            :error="idMapError(scope.row.length, 1)"
                            placeholder="Length"
                          />
                        </q-td>
                        <q-td auto-width>
                          <q-btn
                            flat
                            round
                            dense
                            icon="delete"
                            color="negative"
                            @click="removeIdMap(activeManagedMount.idMaps, scope.rowIndex)"
                          />
                        </q-td>
                      </q-tr>
                    </template>
                  </q-table>
                  <q-btn
                    v-if="!activeManagedMount.idMapPassthrough"
                    no-caps
                    flat
                    size="12px"
                    color="primary"
                    class="u-button q-mt-sm"
                    :label="gettext('Add')"
                    @click="addIdMap(activeManagedMount.idMaps)"
                  />
                  <q-btn
                    v-if="!activeManagedMount.idMapPassthrough"
                    no-caps
                    flat
                    size="12px"
                    color="primary"
                    class="u-button q-mt-sm q-ml-sm"
                    :label="gettext('Clear')"
                    @click="clearIdMaps(activeManagedMount.idMaps)"
                  />
                </div>
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
