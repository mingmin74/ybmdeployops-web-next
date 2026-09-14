<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue';
import { getCephReleases, type CephRelease } from '@/api/cephSetup';
import { request } from '@/api/request';
import UWindow from '@/components/UWindow.vue';
import CephInstallTerminal from './CephInstallTerminal.vue';
import CephInitializeForm from './CephInitializeForm.vue';
import { gettext } from '@/locale';

const model = defineModel<boolean>({ required: true });
const { node, installed } = defineProps<{ node: string; installed: boolean }>();
const step = shallowRef(installed ? 'configuration' : 'info');
const releases = shallowRef<CephRelease[]>([]);
const release = shallowRef('');
const repository = shallowRef('enterprise');
const loading = shallowRef(false);
const error = shallowRef('');
const clusterVersion = shallowRef('');
const subscriptions = shallowRef<{ name: string; level?: string; local?: boolean | number }[]>([]);
const ready = shallowRef(false);
const needsConfiguration = shallowRef(installed);
let disposed = false;
const selectedRelease = computed(() =>
  releases.value.find((entry) => entry.release === release.value)
);
const releaseOptions = computed(() =>
  releases.value
    .filter((entry) => entry.available)
    .map((entry) => ({ label: `${entry.release} (${entry.version})`, value: entry.release }))
);
const repositories = computed(() =>
  [
    { label: gettext('Enterprise (recommended)'), value: 'enterprise' },
    { label: gettext('No-Subscription'), value: 'no-subscription' },
    { label: gettext('Test'), value: 'test' },
    { label: gettext('Manual'), value: 'manual' },
  ].filter((entry) => !selectedRelease.value?.unsupported || entry.value !== 'enterprise')
);
const repositoryHint = computed(() => {
  const nodes = subscriptions.value;
  const allSubscribed = nodes.length > 0 && nodes.every((entry) => !!entry.level);
  const target = nodes.find(
    (entry) => entry.name === node || (node === 'localhost' && entry.local)
  );
  if (repository.value === 'enterprise') {
    if (target && !target.level)
      return gettext('The enterprise repository is enabled, but there is no active subscription!');
    if (nodes.length && !allSubscribed)
      return gettext(
        'Not all nodes have an active subscription, which is required for cluster-wide enterprise repo access'
      );
    return '';
  }
  if (repository.value === 'no-subscription')
    return gettext(
      allSubscribed
        ? 'Cluster has active subscriptions and would be eligible for using the enterprise repository.'
        : 'The no-subscription repository is not the best choice for production setups.'
    );
  if (repository.value === 'manual')
    return gettext(
      'The manual repository option expects that the repository is already configured. For example, in combination with the Proxmox Offline Mirror.'
    );
  return gettext(
    'The test repository should only be used for test setups or after consulting the official Proxmox support!'
  );
});
watch(selectedRelease, (entry) => {
  if (entry?.unsupported && repository.value === 'enterprise') repository.value = 'no-subscription';
});
async function load() {
  loading.value = true;
  error.value = '';
  try {
    const results = await Promise.allSettled([
      getCephReleases(node),
      request<{ node?: Record<string, { version?: { parts?: number[]; str?: string } }> }>(
        '/cluster/ceph/metadata',
        { params: { scope: 'versions' } }
      ),
      request<{ type: string; name: string; level?: string; local?: boolean | number }[]>(
        '/cluster/status'
      ),
    ]);
    if (disposed) return;
    const [releaseResult, metadataResult, subscriptionResult] = results;
    // Every result is inspected; version discovery failures must not enable an invalid installation.
    if (releaseResult.status === 'rejected') throw releaseResult.reason;
    releases.value = (releaseResult.value.data || [])
      .slice()
      .sort((a, b) => parseFloat(a.version) - parseFloat(b.version));
    if (subscriptionResult.status === 'fulfilled')
      subscriptions.value = (subscriptionResult.value.data || []).filter(
        (entry) => entry.type === 'node'
      );
    else throw subscriptionResult.reason;
    if (metadataResult.status === 'rejected') throw metadataResult.reason;
    const actualNode =
      node === 'localhost' ? subscriptions.value.find((entry) => entry.local)?.name : node;
    const versions = Object.entries(metadataResult.value.data?.node || {})
      .filter(([name]) => name !== actualNode)
      .map(([, entry]) => entry.version)
      .filter((entry): entry is { parts: number[]; str?: string } => !!entry?.parts?.length)
      .sort((a, b) => {
        for (let i = 0; i < Math.max(a.parts.length, b.parts.length); i++) {
          const diff = (b.parts[i] || 0) - (a.parts[i] || 0);
          if (diff) return diff;
        }
        return 0;
      });
    const newest = versions[0];
    const clusterRelease = releases.value.find(
      (entry) => parseInt(entry.version, 10) === newest?.parts[0]
    );
    clusterVersion.value = newest?.str || '';
    release.value =
      clusterRelease?.release ||
      releases.value.find((entry) => entry.available && entry['is-default'])?.release ||
      releases.value.find((entry) => entry.available)?.release ||
      '';
  } catch (cause) {
    if (!disposed) error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    if (!disposed) loading.value = false;
  }
}
function installationDetected(configuration: boolean) {
  needsConfiguration.value = configuration;
  ready.value = true;
}
onMounted(() => {
  if (!installed) void load();
});
onBeforeUnmount(() => {
  disposed = true;
});
</script>

<template>
  <q-dialog
    v-model="model"
    persistent
    transition-show="scale"
    transition-hide="scale"
  >
    <UWindow
      :title="`${gettext('Setup')}: Ceph — ${node}`"
      width="760px"
    >
      <div class="q-pa-md">
        <div class="text-weight-bold q-mb-md">
          {{
            gettext(
              {
                info: 'Info',
                installation: 'Installation',
                configuration: 'Configuration',
                success: 'Success',
              }[step] || ''
            )
          }}
        </div>
        <template v-if="step === 'info'">
          <p>
            {{
              gettext(
                'This wizard installs Ceph on this node and creates the initial cluster configuration if needed.'
              )
            }}
          </p>
          <div class="text-grey-7 q-mb-md">
            {{
              clusterVersion
                ? `${gettext('Ceph in the cluster')}: ${clusterVersion}`
                : gettext('Could not detect a ceph installation in the cluster')
            }}
          </div>
          <div class="row q-gutter-lg">
            <q-select
              v-model="release"
              :options="releaseOptions"
              :loading="loading"
              :disable="loading"
              emit-value
              map-options
              dense
              options-dense
              class="col q-field--with-bottom"
              :label="gettext('Ceph version to install')"
            />
            <q-select
              v-model="repository"
              :options="repositories"
              :disable="loading"
              emit-value
              map-options
              dense
              options-dense
              class="col q-field--with-bottom"
              :label="gettext('Repository')"
            />
          </div>
          <p
            v-if="repositoryHint"
            class="text-grey-8"
          >
            {{ repositoryHint }}
          </p>
          <p
            v-if="selectedRelease?.unsupported"
            class="text-grey-8"
          >
            {{
              gettext(
                'The selected release is currently considered a Technology Preview. Although we are not aware of any major issues, there may be some bugs and the Enterprise Repository is not yet available.'
              )
            }}
          </p>
          <div
            v-if="error"
            role="alert"
            class="text-negative"
          >
            {{ error }}
            <q-btn
              flat
              no-caps
              size="12px"
              class="u-button"
              :label="gettext('Retry')"
              @click="load"
            />
          </div>
        </template>
        <CephInstallTerminal
          v-else-if="step === 'installation'"
          :node="node"
          :release="release"
          :repository="repository"
          @installed="installationDetected"
        />
        <template v-else-if="step === 'configuration'">
          <CephInitializeForm
            v-if="needsConfiguration"
            :node="node"
            @configured="step = 'success'"
          />
          <p v-else>{{ gettext('Configuration already initialized') }}</p>
        </template>
        <template v-else>
          <p>{{ gettext('Installation successful!') }}</p>
          <p>
            {{
              gettext(
                'Install Ceph on other nodes, create additional monitors, then create OSDs and pools to start using Ceph.'
              )
            }}
          </p>
        </template>
      </div>
      <template #foot>
        <q-btn
          v-close-popup
          no-caps
          outline
          size="12px"
          class="u-button u-border-button"
          :label="gettext('Close')"
        />
        <q-btn
          v-if="step === 'info'"
          no-caps
          flat
          size="12px"
          class="bg-primary text-grey-1 u-button"
          :disable="
            loading ||
            !!error ||
            !selectedRelease?.available ||
            !repositories.some((entry) => entry.value === repository)
          "
          :label="gettext('Start {0} installation').replace('{0}', release)"
          @click="step = 'installation'"
        />
        <q-btn
          v-else-if="step === 'installation'"
          no-caps
          flat
          size="12px"
          class="bg-primary text-grey-1 u-button"
          :disable="!ready"
          :label="gettext('Next')"
          @click="step = 'configuration'"
        />
        <q-btn
          v-else-if="step === 'configuration' && !needsConfiguration"
          no-caps
          flat
          size="12px"
          class="bg-primary text-grey-1 u-button"
          :label="gettext('Next')"
          @click="step = 'success'"
        />
        <q-btn
          v-else-if="step === 'success'"
          no-caps
          flat
          size="12px"
          class="bg-primary text-grey-1 u-button"
          :label="gettext('Finish')"
          @click="model = false"
        />
      </template>
    </UWindow>
  </q-dialog>
</template>
