<script setup lang="ts">
import { Notify, type QTableColumn } from 'quasar';
import QRCode from 'qrcode';
import { computed, onBeforeUnmount, onMounted, reactive, shallowRef, watch } from 'vue';
import {
  createTfaEntry,
  getTfaRecovery,
  getTfaUsers,
  getUsers,
  removeTfaEntry,
  updateTfaEntry,
  type PveTfaUser,
} from '@/api/users';
import { getClusterConfig, getClusterNodes, type PveRecord } from '@/api/resources';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';
import { useSessionStore } from '@/stores/session';

type TfaRow = {
  id: string;
  userid: string;
  type: string;
  description: string;
  created: number | undefined;
  enable: boolean | undefined;
  locked: boolean;
  enabledText: string;
};
type UserOption = { label: string; value: string; name: string; comment: string };

const loading = shallowRef(false);
const filter = shallowRef('');
const rows = shallowRef<TfaRow[]>([]);
const selected = shallowRef<TfaRow[]>([]);
const editVisible = shallowRef(false);
const removeVisible = shallowRef(false);
const totpVisible = shallowRef(false);
const webauthnVisible = shallowRef(false);
const yubicoVisible = shallowRef(false);
const recoveryVisible = shallowRef(false);
const recoveryKeysVisible = shallowRef(false);
const submitting = shallowRef(false);
const userOptions = shallowRef<UserOption[]>([]);
const filteredUserOptions = shallowRef<UserOption[]>([]);
const qrDataUrl = shallowRef('');
const recoveryKeys = shallowRef<string[]>([]);
const recoveryExists = shallowRef(false);
const session = useSessionStore();
const editForm = reactive({ description: '', enabled: true, password: '' });
const totpForm = reactive({
  userid: '',
  description: '',
  secret: '',
  issuer: `Proxmox VE - ${window.location.hostname}`,
  challenge: '',
  password: '',
});
const recoveryForm = reactive({ userid: '', password: '' });
const webauthnForm = reactive({ userid: '', description: '', password: '' });
const yubicoForm = reactive({ userid: '', description: '', otpValue: '', password: '' });
const removePassword = shallowRef('');
const yubicoEnabled = true;
let refreshTimer: ReturnType<typeof setInterval> | undefined;

const columns: QTableColumn<TfaRow>[] = [
  { name: 'userid', label: gettext('User'), field: 'userid', align: 'left', sortable: true },
  {
    name: 'enabledText',
    label: gettext('Enabled'),
    field: 'enabledText',
    align: 'left',
    sortable: true,
  },
  { name: 'type', label: gettext('TFA Type'), field: 'type', align: 'left', sortable: true },
  { name: 'created', label: gettext('Created'), field: 'created', align: 'left', sortable: true },
  {
    name: 'description',
    label: gettext('Description'),
    field: 'description',
    align: 'left',
    sortable: true,
  },
];

const filteredRows = computed(() => {
  const keyword = filter.value.trim().toLowerCase();
  if (!keyword) return rows.value;
  return rows.value.filter((row) =>
    [row.userid, row.type, row.description, row.enabledText]
      .join(' ')
      .toLowerCase()
      .includes(keyword)
  );
});

function isLocked(user: PveTfaUser, type: string) {
  const tfaLocked = (user['tfa-locked-until'] || 0) > Date.now() / 1000;
  return tfaLocked || (type === 'totp' && Boolean(user['totp-locked']));
}

function formatCreated(timestamp?: number) {
  return timestamp ? new Date(timestamp * 1000).toLocaleString() : 'N/A';
}
const selectedRow = computed(() => selected.value[0]);
const canEdit = computed(() => Boolean(selectedRow.value && selectedRow.value.type !== 'recovery'));
const editTitle = gettext("Modify a TFA entry's description");
const recoveryKeysText = computed(() =>
  recoveryKeys.value.map((key, index) => `${index}: ${key}`).join('\n')
);
const totpUri = computed(() => {
  const issuer = encodeURIComponent(totpForm.issuer);
  const userid = encodeURIComponent(totpForm.userid);
  return `otpauth://totp/${issuer}:${userid}?secret=${totpForm.secret}&period=30&digits=6&algorithm=SHA1&issuer=${issuer}`;
});

function randomBase32Secret() {
  const random = new Uint8Array(32);
  window.crypto.getRandomValues(random);
  return Array.from(random, (byte) => {
    const value = byte & 0x1f;
    return value < 26 ? String.fromCharCode(0x41 + value) : String.fromCharCode(0x32 + value - 26);
  }).join('');
}

async function loadUserOptions() {
  const response = await getUsers();
  const users = (response.data || [])
    .filter((user) => user.enable !== 0 && user.enable !== false)
    .map((user) => ({
      label: user.userid,
      value: user.userid,
      name: `${user.firstname || ''} ${user.lastname || ''}`.trim(),
      comment: user.comment || '',
    }));
  if (session.userid && !users.some((user) => user.value === session.userid)) {
    users.unshift({ label: session.userid, value: session.userid, name: '', comment: '' });
  }
  userOptions.value = users;
  filteredUserOptions.value = users;
}

function filterUserOptions(value: string, update: (callback: () => void) => void) {
  update(() => {
    const keyword = value.trim().toLowerCase();
    filteredUserOptions.value = !keyword
      ? userOptions.value
      : userOptions.value.filter((user) =>
          [user.value, user.name, user.comment].join(' ').toLowerCase().includes(keyword)
        );
  });
}

function resetTotpForm() {
  totpForm.userid = session.userid;
  totpForm.description = '';
  totpForm.secret = randomBase32Secret();
  totpForm.challenge = '';
  totpForm.password = '';
}

async function openTotp() {
  resetTotpForm();
  totpVisible.value = true;
  await loadUserOptions();
}

async function checkRecoveryEntry() {
  recoveryExists.value = false;
  if (!recoveryForm.userid) return;
  try {
    await getTfaRecovery(recoveryForm.userid);
    recoveryExists.value = true;
  } catch {
    // A missing recovery entry is the expected response for a new user.
  }
}

async function openRecovery() {
  recoveryForm.userid = session.userid;
  recoveryForm.password = '';
  recoveryVisible.value = true;
  await loadUserOptions();
  await checkRecoveryEntry();
}

async function openWebauthn() {
  webauthnForm.userid = session.userid;
  webauthnForm.description = '';
  webauthnForm.password = '';
  webauthnVisible.value = true;
  await loadUserOptions();
}

async function openYubico() {
  yubicoForm.userid = session.userid;
  yubicoForm.description = '';
  yubicoForm.otpValue = '';
  yubicoForm.password = '';
  yubicoVisible.value = true;
  await loadUserOptions();
}

async function saveTotp() {
  if (
    !totpForm.userid ||
    !totpForm.description ||
    !/^[A-Z2-7=]+$/.test(totpForm.secret) ||
    !/^\d{6,8}$/.test(totpForm.challenge)
  ) {
    Notify.create({ type: 'warning', message: gettext('Please fill in all required fields.') });
    return;
  }
  if (session.userid !== 'root@pam' && totpForm.password.length < 5) {
    Notify.create({ type: 'warning', message: gettext('Please verify your password.') });
    return;
  }
  submitting.value = true;
  try {
    await createTfaEntry(totpForm.userid, {
      type: 'totp',
      description: totpForm.description,
      totp: totpUri.value,
      value: totpForm.challenge,
      ...(session.userid === 'root@pam' ? {} : { password: totpForm.password }),
    });
    totpVisible.value = false;
    await loadRows();
  } finally {
    submitting.value = false;
  }
}

async function saveRecovery() {
  if (!recoveryForm.userid || recoveryExists.value) return;
  if (session.userid !== 'root@pam' && recoveryForm.password.length < 5) {
    Notify.create({ type: 'warning', message: gettext('Please verify your password.') });
    return;
  }
  submitting.value = true;
  try {
    const response = await createTfaEntry(recoveryForm.userid, {
      type: 'recovery',
      ...(session.userid === 'root@pam' ? {} : { password: recoveryForm.password }),
    });
    recoveryVisible.value = false;
    recoveryKeys.value = response.data?.recovery || [];
    recoveryKeysVisible.value = recoveryKeys.value.length > 0;
    await loadRows();
  } finally {
    submitting.value = false;
  }
}

function base64UrlToBytes(value: string) {
  const base64 = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

function bytesToBase64Url(value: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(value)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function registerWebauthn() {
  if (
    !webauthnForm.userid ||
    !webauthnForm.description ||
    (session.userid !== 'root@pam' && webauthnForm.password.length < 5)
  ) {
    Notify.create({ type: 'warning', message: gettext('Please fill in all required fields.') });
    return;
  }
  if (!window.PublicKeyCredential || !navigator.credentials) {
    Notify.create({
      type: 'negative',
      message: gettext('WebAuthn requires using a trusted certificate.'),
    });
    return;
  }
  submitting.value = true;
  try {
    const initial = await createTfaEntry(webauthnForm.userid, {
      type: 'webauthn',
      description: webauthnForm.description,
      ...(session.userid === 'root@pam' ? {} : { password: webauthnForm.password }),
    });
    if (!initial.data?.challenge) throw new Error('server did not respond with a challenge');
    const request = JSON.parse(initial.data.challenge) as {
      publicKey: {
        challenge: string;
        user: { id: string; name: string; displayName: string };
        excludeCredentials?: Array<{
          id: string;
          type: PublicKeyCredentialType;
          transports?: AuthenticatorTransport[];
        }>;
      } & Omit<PublicKeyCredentialCreationOptions, 'challenge' | 'user' | 'excludeCredentials'>;
    };
    const challenge = request.publicKey.challenge;
    const {
      challenge: _ignoredChallenge,
      user: webauthnUser,
      excludeCredentials,
      ...publicKeyOptions
    } = request.publicKey;
    void _ignoredChallenge;
    const creationOptions: CredentialCreationOptions = {
      publicKey: {
        ...publicKeyOptions,
        challenge: base64UrlToBytes(challenge),
        user: { ...webauthnUser, id: base64UrlToBytes(webauthnUser.id) },
        ...(excludeCredentials
          ? {
              excludeCredentials: excludeCredentials.map((entry) => ({
                ...entry,
                id: base64UrlToBytes(entry.id),
              })),
            }
          : {}),
      },
    };
    const credential = (await navigator.credentials.create(
      creationOptions
    )) as PublicKeyCredential | null;
    if (!credential || !(credential.response instanceof AuthenticatorAttestationResponse))
      throw new Error('WebAuthn registration was cancelled');
    await createTfaEntry(webauthnForm.userid, {
      type: 'webauthn',
      challenge,
      value: JSON.stringify({
        id: credential.id,
        type: credential.type,
        rawId: bytesToBase64Url(credential.rawId),
        response: {
          attestationObject: bytesToBase64Url(credential.response.attestationObject),
          clientDataJSON: bytesToBase64Url(credential.response.clientDataJSON),
        },
      }),
      ...(session.userid === 'root@pam' ? {} : { password: webauthnForm.password }),
    });
    webauthnVisible.value = false;
    await loadRows();
  } catch (error) {
    Notify.create({
      type: 'negative',
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    submitting.value = false;
  }
}

async function saveYubico() {
  if (
    !yubicoForm.userid ||
    !yubicoForm.description ||
    !/^[a-zA-Z0-9]{44}$/.test(yubicoForm.otpValue) ||
    (session.userid !== 'root@pam' && yubicoForm.password.length < 5)
  ) {
    Notify.create({ type: 'warning', message: gettext('Please fill in all required fields.') });
    return;
  }
  submitting.value = true;
  try {
    await createTfaEntry(yubicoForm.userid, {
      type: 'yubico',
      description: yubicoForm.description,
      value: yubicoForm.otpValue,
      ...(session.userid === 'root@pam' ? {} : { password: yubicoForm.password }),
    });
    yubicoVisible.value = false;
    await loadRows();
  } finally {
    submitting.value = false;
  }
}

async function copyRecoveryKeys() {
  await navigator.clipboard.writeText(recoveryKeysText.value);
  Notify.create({ type: 'positive', message: gettext('Recovery keys copied.') });
}

function printRecoveryKeys() {
  const printFrame = document.createElement('iframe');
  Object.assign(printFrame.style, {
    position: 'fixed',
    right: '0',
    bottom: '0',
    width: '0',
    height: '0',
    border: '0',
  });
  const title = `${gettext('Recovery Keys')} ${gettext('for')} ${recoveryForm.userid}`;
  printFrame.srcdoc = `<title>${title}</title><pre>${recoveryKeysText.value}</pre>`;
  printFrame.onload = () => printFrame.contentWindow?.print();
  document.body.appendChild(printFrame);
  window.setTimeout(() => printFrame.remove(), 1000);
}

let qrRequest = 0;
watch(
  [() => totpVisible.value, () => totpUri.value],
  async ([visible, uri]) => {
    const requestId = ++qrRequest;
    if (!visible || !uri) {
      qrDataUrl.value = '';
      return;
    }
    const value = await QRCode.toDataURL(uri, { width: 256, margin: 1, errorCorrectionLevel: 'M' });
    if (requestId === qrRequest) qrDataUrl.value = value;
  },
  { immediate: true }
);
watch(
  () => recoveryForm.userid,
  () => void checkRecoveryEntry()
);

function openEdit() {
  const row = selectedRow.value;
  if (!row || row.type === 'recovery') return;
  editForm.description = row.description;
  editForm.enabled = row.enable !== false;
  editForm.password = '';
  editVisible.value = true;
}
async function saveEdit() {
  const row = selectedRow.value;
  if (!row) return;
  if (!editForm.description || (session.userid !== 'root@pam' && editForm.password.length < 5)) {
    Notify.create({ type: 'warning', message: gettext('Please fill in all required fields.') });
    return;
  }
  await updateTfaEntry(row.id, {
    description: editForm.description,
    enable: editForm.enabled ? 1 : 0,
    ...(session.userid === 'root@pam' ? {} : { password: editForm.password }),
  });
  editVisible.value = false;
  await loadRows();
}
function removeSelected() {
  if (!selectedRow.value) return;
  removePassword.value = '';
  removeVisible.value = true;
}
async function confirmRemove() {
  const row = selectedRow.value;
  if (!row || (session.userid !== 'root@pam' && removePassword.value.length < 5)) return;
  await removeTfaEntry(row.id, session.userid === 'root@pam' ? undefined : removePassword.value);
  removeVisible.value = false;
  await loadRows();
}

async function loadRows() {
  loading.value = true;
  try {
    const response = await getTfaUsers();
    rows.value = (response.data || [])
      .flatMap((user) =>
        (user.entries || []).map((entry) => ({
          id: `${user.userid}/${entry.id}`,
          userid: user.userid,
          type: entry.type,
          description: entry.description || '',
          created: entry.created,
          enable: entry.enable,
          locked: isLocked(user, entry.type),
          enabledText: isLocked(user, entry.type)
            ? gettext('Locked')
            : entry.enable === false
              ? gettext('Disabled')
              : gettext('Enabled'),
        }))
      )
      .sort(
        (left, right) => left.userid.localeCompare(right.userid) || left.id.localeCompare(right.id)
      );
  } finally {
    loading.value = false;
  }
}

async function loadIssuerName() {
  try {
    const [configResponse, nodesResponse] = await Promise.all([
      getClusterConfig(),
      getClusterNodes(),
    ]);
    const config = configResponse.data || {};
    const totem = (config.totem || {}) as PveRecord;
    const clusterName = typeof totem.cluster_name === 'string' ? totem.cluster_name : '';
    const nodeName =
      typeof nodesResponse.data?.[0]?.node === 'string'
        ? nodesResponse.data[0].node
        : window.location.hostname;
    totpForm.issuer = `Proxmox VE - ${clusterName || nodeName}`;
  } catch {
    // The hostname remains the standalone-node fallback.
  }
}

onMounted(() => {
  void loadRows();
  void loadIssuerName();
  refreshTimer = setInterval(() => void loadRows(), 5000);
});
onBeforeUnmount(() => {
  if (refreshTimer) clearInterval(refreshTimer);
});
defineExpose({ reload: loadRows });
</script>

<template>
  <q-card
    flat
    class="no-border-radius no-shadow"
  >
    <q-table
      flat
      v-model:selected="selected"
      selection="single"
      hide-selected-banner
      :rows="filteredRows"
      :columns="columns"
      row-key="id"
      table-header-class="u-table-header"
      :loading="loading"
      :pagination="{ page: 1, rowsPerPage: 10 }"
      :rows-per-page-options="[10]"
      :no-data-label="gettext('no record can be found')"
      @row-dblclick="openEdit"
    >
      <template #top>
        <div class="q-gutter-sm">
          <q-btn-dropdown
            outline
            no-caps
            size="12px"
            color="primary"
            class="u-button"
            :label="gettext('Add')"
          >
            <q-list dense>
              <q-item
                v-close-popup
                clickable
                @click="openTotp"
              >
                <q-item-section>{{ gettext('TOTP') }}</q-item-section>
              </q-item>
              <q-item
                v-close-popup
                clickable
                @click="openWebauthn"
              >
                <q-item-section>{{ gettext('WebAuthn') }}</q-item-section>
              </q-item>
              <q-item
                v-close-popup
                clickable
                @click="openRecovery"
              >
                <q-item-section>{{ gettext('Recovery Keys') }}</q-item-section>
              </q-item>
              <q-item
                v-if="yubicoEnabled"
                v-close-popup
                clickable
                @click="openYubico"
              >
                <q-item-section>{{ gettext('Yubico OTP') }}</q-item-section>
              </q-item>
            </q-list>
          </q-btn-dropdown>
          <q-btn
            outline
            no-caps
            size="12px"
            class="u-button"
            :color="canEdit ? 'primary' : 'grey'"
            :disable="!canEdit"
            :label="gettext('Edit')"
            @click="openEdit"
          />
          <q-btn
            outline
            no-caps
            size="12px"
            class="u-button"
            :color="selectedRow ? 'red' : 'grey'"
            :disable="!selectedRow"
            :label="gettext('Remove')"
            @click="removeSelected"
          />
          <q-btn
            outline
            no-caps
            size="12px"
            color="primary"
            class="u-button"
            :label="gettext('Reload')"
            :loading="loading"
            @click="loadRows"
          />
        </div>
        <q-space />
        <q-input
          v-model="filter"
          borderless
          dense
          debounce="300"
          :placeholder="gettext('Search')"
        >
          <template #append><q-icon name="search" /></template>
        </q-input>
      </template>
      <template #body-cell-created="props">
        <q-td :props="props">{{ formatCreated(props.row.created) }}</q-td>
      </template>
    </q-table>

    <q-dialog
      v-model="editVisible"
      persistent
      transition-show="scale"
      transition-hide="scale"
    >
      <UWindow
        width="400px"
        :title="editTitle"
      >
        <div class="u-border q-ma-sm q-pa-md u-dense">
          <q-input
            v-model="editForm.description"
            dense
            :label="`${gettext('Description')} *`"
            class="q-field--with-bottom"
          />
          <q-checkbox
            v-model="editForm.enabled"
            dense
            right-label
            color="primary"
            :label="gettext('Enabled')"
          />
          <q-input
            v-if="session.userid !== 'root@pam'"
            v-model="editForm.password"
            dense
            type="password"
            :label="`${gettext('Password')} *`"
            class="q-field--with-bottom"
            hint="verify current password"
          />
        </div>
        <template #foot>
          <q-btn
            v-close-popup
            flat
            no-caps
            size="12px"
            :label="gettext('Cancel')"
          />
          <q-btn
            no-caps
            flat
            size="12px"
            :label="gettext('OK')"
            class="bg-primary text-grey-1 u-button"
            @click="saveEdit"
          />
        </template>
      </UWindow>
    </q-dialog>
    <q-dialog
      v-model="removeVisible"
      persistent
      transition-show="scale"
      transition-hide="scale"
    >
      <UWindow
        width="600px"
        :title="gettext('Confirm TFA Removal')"
      >
        <div
          v-if="selectedRow"
          class="u-border q-ma-sm q-pa-md u-dense"
        >
          <div class="q-mb-sm">
            {{ gettext('Are you sure you want to remove this TFA entry?') }}
          </div>
          <div class="row q-col-gutter-lg q-mb-sm">
            <div class="col">
              <div>
                <span class="text-grey-7">{{ gettext('User') }}:</span>
                {{ selectedRow.userid }}
              </div>
              <div>
                <span class="text-grey-7">{{ gettext('Type') }}:</span>
                {{ selectedRow.type }}
              </div>
            </div>
            <div class="col">
              <div>
                <span class="text-grey-7">{{ gettext('Created') }}:</span>
                {{ formatCreated(selectedRow.created) }}
              </div>
              <div>
                <span class="text-grey-7">{{ gettext('Description') }}:</span>
                {{ selectedRow.description || gettext('None') }}
              </div>
            </div>
          </div>
          <q-input
            v-if="session.userid !== 'root@pam'"
            v-model="removePassword"
            dense
            type="password"
            :label="`${gettext('Password')} *`"
            class="q-field--with-bottom"
            :hint="`${gettext('Confirm your')} (${session.userid}) ${gettext('password')}`"
          />
        </div>
        <template #foot>
          <q-btn
            v-close-popup
            flat
            no-caps
            size="12px"
            :label="gettext('Cancel')"
          />
          <q-btn
            no-caps
            flat
            size="12px"
            :label="gettext('Remove')"
            class="bg-negative text-grey-1 u-button"
            @click="confirmRemove"
          />
        </template>
      </UWindow>
    </q-dialog>
    <q-dialog
      v-model="totpVisible"
      persistent
      transition-show="scale"
      transition-hide="scale"
    >
      <UWindow
        width="520px"
        :title="gettext('Add a TOTP login factor')"
      >
        <div class="u-border q-ma-sm q-pa-md u-dense">
          <q-select
            v-model="totpForm.userid"
            dense
            options-dense
            use-input
            fill-input
            hide-selected
            emit-value
            map-options
            :options="filteredUserOptions"
            :label="`${gettext('User')} *`"
            class="q-field--with-bottom"
            @filter="filterUserOptions"
          >
            <template #option="scope">
              <q-item v-bind="scope.itemProps">
                <q-item-section>
                  <q-item-label>{{ scope.opt.value }}</q-item-label>
                  <q-item-label caption>
                    {{ scope.opt.name || gettext('None') }} ·
                    {{ scope.opt.comment || gettext('None') }}
                  </q-item-label>
                </q-item-section>
              </q-item>
            </template>
          </q-select>
          <q-input
            v-model="totpForm.description"
            dense
            maxlength="256"
            :label="`${gettext('Description')} *`"
            class="q-field--with-bottom"
            :hint="gettext('For example: TFA device ID, required to identify multiple factors.')"
          />
          <div class="row q-gutter-sm q-mb-sm">
            <q-input
              v-model="totpForm.secret"
              class="col q-field--with-bottom"
              dense
              :label="gettext('Secret')"
            />
            <q-btn
              no-caps
              outline
              size="12px"
              color="primary"
              class="u-button self-end"
              :label="gettext('Randomize')"
              @click="totpForm.secret = randomBase32Secret()"
            />
          </div>
          <q-input
            v-model="totpForm.issuer"
            dense
            :label="gettext('Issuer Name')"
            class="q-field--with-bottom"
          />
          <div class="row justify-center q-my-md">
            <q-img
              v-if="qrDataUrl"
              :src="qrDataUrl"
              width="256px"
              height="256px"
              fit="contain"
              class="bg-white q-pa-sm"
            />
          </div>
          <q-input
            v-model="totpForm.challenge"
            dense
            inputmode="numeric"
            maxlength="8"
            :label="`${gettext('Verify Code')} *`"
            class="q-field--with-bottom"
            :hint="gettext('Scan QR code in a TOTP app and enter an auth. code here')"
          />
          <q-input
            v-if="session.userid !== 'root@pam'"
            v-model="totpForm.password"
            dense
            type="password"
            minlength="5"
            :label="`${gettext('Verify Password')} *`"
            class="q-field--with-bottom"
          />
        </div>
        <template #foot>
          <q-btn
            v-close-popup
            flat
            no-caps
            size="12px"
            :label="gettext('Cancel')"
          />
          <q-btn
            no-caps
            flat
            size="12px"
            :loading="submitting"
            :label="gettext('OK')"
            class="bg-primary text-grey-1 u-button"
            @click="saveTotp"
          />
        </template>
      </UWindow>
    </q-dialog>
    <q-dialog
      v-model="recoveryVisible"
      persistent
      transition-show="scale"
      transition-hide="scale"
    >
      <UWindow
        width="440px"
        :title="gettext('Add: TFA recovery keys')"
      >
        <div class="u-border q-ma-sm q-pa-md u-dense">
          <q-select
            v-model="recoveryForm.userid"
            dense
            options-dense
            use-input
            fill-input
            hide-selected
            emit-value
            map-options
            :options="filteredUserOptions"
            :label="`${gettext('User')} *`"
            class="q-field--with-bottom"
            @filter="filterUserOptions"
          >
            <template #option="scope">
              <q-item v-bind="scope.itemProps">
                <q-item-section>
                  <q-item-label>{{ scope.opt.value }}</q-item-label>
                  <q-item-label caption>
                    {{ scope.opt.name || gettext('None') }} ·
                    {{ scope.opt.comment || gettext('None') }}
                  </q-item-label>
                </q-item-section>
              </q-item>
            </template>
          </q-select>
          <div
            v-if="recoveryExists"
            class="text-negative q-mb-sm"
          >
            {{ gettext('User already has recovery keys.') }}
          </div>
          <q-input
            v-if="session.userid !== 'root@pam'"
            v-model="recoveryForm.password"
            dense
            type="password"
            minlength="5"
            :label="`${gettext('Verify Password')} *`"
            class="q-field--with-bottom"
          />
        </div>
        <template #foot>
          <q-btn
            v-close-popup
            flat
            no-caps
            size="12px"
            :label="gettext('Cancel')"
          />
          <q-btn
            no-caps
            flat
            size="12px"
            :disable="recoveryExists"
            :loading="submitting"
            :label="gettext('OK')"
            class="bg-primary text-grey-1 u-button"
            @click="saveRecovery"
          />
        </template>
      </UWindow>
    </q-dialog>
    <q-dialog
      v-model="webauthnVisible"
      persistent
      transition-show="scale"
      transition-hide="scale"
    >
      <UWindow
        width="512px"
        :title="gettext('Add a Webauthn login token')"
      >
        <div class="u-border q-ma-sm q-pa-md u-dense">
          <q-select
            v-model="webauthnForm.userid"
            dense
            options-dense
            use-input
            fill-input
            hide-selected
            emit-value
            map-options
            :options="filteredUserOptions"
            :label="`${gettext('User')} *`"
            class="q-field--with-bottom"
            @filter="filterUserOptions"
          >
            <template #option="scope">
              <q-item v-bind="scope.itemProps">
                <q-item-section>
                  <q-item-label>{{ scope.opt.value }}</q-item-label>
                  <q-item-label caption>
                    {{ scope.opt.name || gettext('None') }} ·
                    {{ scope.opt.comment || gettext('None') }}
                  </q-item-label>
                </q-item-section>
              </q-item>
            </template>
          </q-select>
          <q-input
            v-model="webauthnForm.description"
            dense
            maxlength="256"
            :label="`${gettext('Description')} *`"
            class="q-field--with-bottom"
            :hint="gettext('For example: TFA device ID, required to identify multiple factors.')"
          />
          <q-input
            v-if="session.userid !== 'root@pam'"
            v-model="webauthnForm.password"
            dense
            type="password"
            :label="`${gettext('Verify Password')} *`"
            class="q-field--with-bottom"
          />
        </div>
        <template #foot>
          <q-btn
            v-close-popup
            flat
            no-caps
            size="12px"
            :label="gettext('Cancel')"
          />
          <q-btn
            no-caps
            flat
            size="12px"
            :loading="submitting"
            :label="gettext('Register Webauthn Device')"
            class="bg-primary text-grey-1 u-button"
            @click="registerWebauthn"
          />
        </template>
      </UWindow>
    </q-dialog>
    <q-dialog
      v-model="yubicoVisible"
      persistent
      transition-show="scale"
      transition-hide="scale"
    >
      <UWindow
        width="512px"
        :title="gettext('Add a Yubico OTP key')"
      >
        <div class="u-border q-ma-sm q-pa-md u-dense">
          <q-select
            v-model="yubicoForm.userid"
            dense
            options-dense
            use-input
            fill-input
            hide-selected
            emit-value
            map-options
            :options="filteredUserOptions"
            :label="`${gettext('User')} *`"
            class="q-field--with-bottom"
            @filter="filterUserOptions"
          >
            <template #option="scope">
              <q-item v-bind="scope.itemProps">
                <q-item-section>
                  <q-item-label>{{ scope.opt.value }}</q-item-label>
                  <q-item-label caption>
                    {{ scope.opt.name || gettext('None') }} ·
                    {{ scope.opt.comment || gettext('None') }}
                  </q-item-label>
                </q-item-section>
              </q-item>
            </template>
          </q-select>
          <q-input
            v-model="yubicoForm.description"
            dense
            maxlength="256"
            :label="`${gettext('Description')} *`"
            class="q-field--with-bottom"
            :hint="gettext('For example: TFA device ID, required to identify multiple factors.')"
          />
          <q-input
            v-model="yubicoForm.otpValue"
            dense
            maxlength="44"
            :label="`${gettext('Yubico OTP Key')} *`"
            class="q-field--with-bottom"
            :hint="gettext('A currently valid Yubico OTP value')"
          />
          <q-input
            v-if="session.userid !== 'root@pam'"
            v-model="yubicoForm.password"
            dense
            type="password"
            :label="`${gettext('Verify Password')} *`"
            class="q-field--with-bottom"
          />
          <div class="text-sm text-warning q-mt-xs">
            <span class="text-weight-medium">{{ gettext('Tip:') }}</span>
            {{ gettext('YubiKeys also support WebAuthn, which is often a better alternative.') }}
          </div>
        </div>
        <template #foot>
          <q-btn
            v-close-popup
            flat
            no-caps
            size="12px"
            :label="gettext('Cancel')"
          />
          <q-btn
            no-caps
            flat
            size="12px"
            :loading="submitting"
            :label="gettext('OK')"
            class="bg-primary text-grey-1 u-button"
            @click="saveYubico"
          />
        </template>
      </UWindow>
    </q-dialog>
    <q-dialog
      v-model="recoveryKeysVisible"
      persistent
      transition-show="scale"
      transition-hide="scale"
      @hide="recoveryKeys = []"
    >
      <UWindow
        width="520px"
        :title="gettext('Recovery Keys')"
      >
        <div class="u-border q-ma-sm q-pa-md u-dense">
          <q-input
            :model-value="recoveryKeysText"
            dense
            type="textarea"
            readonly
            autogrow
            input-class="text-mono"
            class="q-field--with-bottom"
          />
          <div class="q-mt-sm text-warning text-sm">
            {{ gettext('Please record recovery keys - they will only be displayed now') }}
          </div>
        </div>
        <template #foot>
          <q-btn
            v-close-popup
            flat
            no-caps
            size="12px"
            :label="gettext('Close')"
          />
          <q-btn
            no-caps
            flat
            size="12px"
            outline
            color="primary"
            class="u-button"
            :label="gettext('Print Recovery Keys')"
            @click="printRecoveryKeys"
          />
          <q-btn
            no-caps
            flat
            size="12px"
            :label="gettext('Copy Recovery Keys')"
            class="bg-primary text-grey-1 u-button"
            @click="copyRecoveryKeys"
          />
        </template>
      </UWindow>
    </q-dialog>
  </q-card>
</template>
