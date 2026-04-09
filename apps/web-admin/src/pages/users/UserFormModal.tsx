import { useEffect, useState } from 'react';
import { adminUsersApi } from '@telemed/api-client';
import type { CreateUserDto, Role, UserSummaryDto } from '@telemed/shared-types';
import {
  Alert,
  Button,
  FormField,
  Input,
  Modal,
  Select,
  Textarea,
} from '@telemed/ui';
import { apiClient } from '../../lib/api';

const adminUsers = adminUsersApi(apiClient);

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (dto: CreateUserDto) => void;
  isPending: boolean;
  error: unknown;
  generatedPassword: string | null;
  /** True when the form is being shown by /platform/users (PLATFORM_SUPER_ADMIN). */
  platformActor: boolean;
}

const ROLE_OPTIONS_CLINIC: Array<{ value: Role; label: string }> = [
  { value: 'PATIENT', label: 'Пацієнт' },
  { value: 'DOCTOR', label: 'Лікар' },
  { value: 'CLINIC_OPERATOR', label: 'Оператор клініки' },
  { value: 'CLINIC_ADMIN', label: 'Адмін клініки' },
];

const ROLE_OPTIONS_PLATFORM: Array<{ value: Role; label: string }> = [
  ...ROLE_OPTIONS_CLINIC,
  { value: 'PLATFORM_SUPER_ADMIN', label: 'Супер-адмін платформи' },
  { value: 'PLATFORM_SUPPORT', label: 'Підтримка платформи' },
  { value: 'PLATFORM_FINANCE', label: 'Фінансист платформи' },
  { value: 'AUDITOR', label: 'Аудитор' },
];

const errorMessage = (e: unknown): string => {
  if (!e) return '';
  if (e instanceof Error) return e.message;
  if (typeof e === 'object' && e !== null && 'message' in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return 'Сталася помилка';
};

export const UserFormModal = ({
  open,
  onClose,
  onSubmit,
  isPending,
  error,
  generatedPassword,
  platformActor,
}: Props) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<Role>('PATIENT');
  // Doctor extras
  const [specializations, setSpecializations] = useState('');
  const [languages, setLanguages] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [yearsOfExperience, setYearsOfExperience] = useState('');
  const [basePrice, setBasePrice] = useState('');
  const [bio, setBio] = useState('');

  // Lookup state
  const [lookupTriggered, setLookupTriggered] = useState(false);
  const [lookupExisting, setLookupExisting] = useState<UserSummaryDto | null>(null);
  const [lookupChecking, setLookupChecking] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) {
      setEmail('');
      setPassword('');
      setFirstName('');
      setLastName('');
      setPhone('');
      setRole('PATIENT');
      setSpecializations('');
      setLanguages('');
      setLicenseNumber('');
      setYearsOfExperience('');
      setBasePrice('');
      setBio('');
      setLookupTriggered(false);
      setLookupExisting(null);
      setLookupError(null);
      setTouched(false);
    }
  }, [open]);

  const ROLE_OPTIONS = platformActor ? ROLE_OPTIONS_PLATFORM : ROLE_OPTIONS_CLINIC;

  const checkEmail = async () => {
    if (!email.trim()) return;
    setLookupChecking(true);
    setLookupError(null);
    try {
      const res = await adminUsers.lookup(email.trim());
      setLookupExisting(res.exists ? res.user ?? null : null);
      setLookupTriggered(true);
      if (res.exists && res.user) {
        setFirstName(res.user.firstName ?? '');
        setLastName(res.user.lastName ?? '');
        setPhone(res.user.phone ?? '');
      }
    } catch (e) {
      setLookupError(errorMessage(e));
    } finally {
      setLookupChecking(false);
    }
  };

  const splitCsv = (v: string) =>
    v.split(',').map((s) => s.trim()).filter(Boolean);

  const validate = (): string | null => {
    if (!email.trim()) return 'Введіть email';
    if (!firstName.trim()) return 'Введіть імʼя';
    if (!lastName.trim()) return 'Введіть прізвище';
    if (role === 'DOCTOR') {
      if (!password) return 'Лікарю потрібен пароль (≥ 8 символів)';
      if (password.length < 8) return 'Пароль має містити щонайменше 8 символів';
      if (splitCsv(specializations).length === 0) {
        return 'Вкажіть хоча б одну спеціалізацію';
      }
    }
    if (password && password.length < 8) {
      return 'Пароль має містити щонайменше 8 символів';
    }
    return null;
  };

  const submit = () => {
    setTouched(true);
    const err = validate();
    if (err) return;

    const dto: CreateUserDto = {
      email: email.trim(),
      password: password || undefined,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone.trim() || undefined,
      role,
    };
    if (role === 'DOCTOR') {
      Object.assign(dto, {
        specializations: splitCsv(specializations),
        languages: splitCsv(languages),
        licenseNumber: licenseNumber.trim() || undefined,
        yearsOfExperience: yearsOfExperience.trim()
          ? Number(yearsOfExperience)
          : undefined,
        basePrice: basePrice.trim() ? Number(basePrice) : undefined,
        bio: bio.trim() || undefined,
      });
    }
    onSubmit(dto);
  };

  const validationError = touched ? validate() : null;
  const apiErrorText = errorMessage(error);

  // After successful create with a generated password — show it as a banner
  // and let the admin copy it. Don't auto-close.
  if (generatedPassword) {
    return (
      <Modal
        open={open}
        onClose={onClose}
        title="Користувача створено"
        footer={
          <Button onClick={onClose}>Закрити</Button>
        }
      >
        <div className="space-y-3">
          <Alert variant="success">
            Користувача успішно створено. Тимчасовий пароль:
          </Alert>
          <div className="rounded-lg border border-slate-300 bg-slate-50 p-3 font-mono text-sm">
            {generatedPassword}
          </div>
          <p className="text-xs text-slate-500">
            Цей пароль показується лише один раз — скопіюйте його та передайте
            користувачеві захищеним каналом. Користувач має його змінити при
            першому вході.
          </p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Додати користувача"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            Скасувати
          </Button>
          <Button onClick={submit} isLoading={isPending}>
            {lookupExisting ? 'Додати роль' : 'Створити'}
          </Button>
        </>
      }
    >
      <div className="space-y-1">
        {validationError ? (
          <Alert variant="warning">{validationError}</Alert>
        ) : null}
        {apiErrorText ? <Alert variant="danger">{apiErrorText}</Alert> : null}
        {lookupError ? <Alert variant="danger">{lookupError}</Alert> : null}

        <FormField label="Email">
          <div className="flex gap-2">
            <Input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setLookupTriggered(false);
                setLookupExisting(null);
              }}
              placeholder="user@example.com"
            />
            <Button
              variant="outline"
              onClick={checkEmail}
              isLoading={lookupChecking}
              disabled={!email.trim()}
            >
              Перевірити
            </Button>
          </div>
        </FormField>

        {lookupTriggered && lookupExisting ? (
          <Alert variant="info">
            Користувач{' '}
            <strong>
              {lookupExisting.firstName} {lookupExisting.lastName}
            </strong>{' '}
            вже існує. Йому буде додано нову роль у вашій клініці.
          </Alert>
        ) : null}
        {lookupTriggered && !lookupExisting ? (
          <Alert variant="info">
            Email вільний — буде створено нового користувача.
          </Alert>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Імʼя">
            <Input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              disabled={!!lookupExisting}
            />
          </FormField>
          <FormField label="Прізвище">
            <Input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              disabled={!!lookupExisting}
            />
          </FormField>
        </div>

        <FormField label="Телефон">
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={!!lookupExisting}
          />
        </FormField>

        {!lookupExisting ? (
          <FormField label="Пароль" hint="Залиште пустим для генерації тимчасового">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </FormField>
        ) : null}

        <FormField label="Роль">
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </FormField>

        {role === 'DOCTOR' && !lookupExisting ? (
          <>
            <FormField
              label="Спеціалізації"
              hint="Через кому, наприклад: Терапевт, Кардіолог"
            >
              <Input
                value={specializations}
                onChange={(e) => setSpecializations(e.target.value)}
              />
            </FormField>
            <FormField label="Мови" hint="Через кому, наприклад: uk, en">
              <Input
                value={languages}
                onChange={(e) => setLanguages(e.target.value)}
              />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Номер ліцензії">
                <Input
                  value={licenseNumber}
                  onChange={(e) => setLicenseNumber(e.target.value)}
                />
              </FormField>
              <FormField label="Стаж (років)">
                <Input
                  type="number"
                  min={0}
                  value={yearsOfExperience}
                  onChange={(e) => setYearsOfExperience(e.target.value)}
                />
              </FormField>
            </div>
            <FormField label="Базова ціна (₴)">
              <Input
                type="number"
                min={0}
                step="0.01"
                value={basePrice}
                onChange={(e) => setBasePrice(e.target.value)}
              />
            </FormField>
            <FormField label="Біографія">
              <Textarea
                rows={3}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
              />
            </FormField>
          </>
        ) : null}
      </div>
    </Modal>
  );
};
