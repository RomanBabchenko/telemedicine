import { FormEvent, useEffect, useState } from 'react';
import type { CreateDoctorDto, DoctorDto, UpdateDoctorDto } from '@telemed/shared-types';
import {
  Alert,
  Button,
  FormField,
  Input,
  Modal,
  Textarea,
} from '@telemed/ui';

type Mode = 'create' | 'edit';

interface Props {
  open: boolean;
  mode: Mode;
  initial?: DoctorDto | null;
  isPending: boolean;
  error: unknown;
  onClose: () => void;
  onSubmitCreate: (dto: CreateDoctorDto) => void;
  onSubmitUpdate: (dto: UpdateDoctorDto) => void;
}

const splitCsv = (value: string): string[] =>
  value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

const joinCsv = (value: string[] | undefined | null): string =>
  (value ?? []).join(', ');

const errorMessage = (error: unknown): string => {
  if (!error) return '';
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const m = (error as { message?: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return 'Сталася помилка';
};

export const DoctorFormModal = ({
  open,
  mode,
  initial,
  isPending,
  error,
  onClose,
  onSubmitCreate,
  onSubmitUpdate,
}: Props) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [specializations, setSpecializations] = useState('');
  const [languages, setLanguages] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [yearsOfExperience, setYearsOfExperience] = useState('');
  const [basePrice, setBasePrice] = useState('');
  const [defaultDurationMin, setDefaultDurationMin] = useState('');
  const [bio, setBio] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTouched(false);
    if (mode === 'edit' && initial) {
      setEmail('');
      setPassword('');
      setFirstName(initial.firstName);
      setLastName(initial.lastName);
      setSpecializations(joinCsv(initial.specializations));
      setLanguages(joinCsv(initial.languages));
      setLicenseNumber(initial.licenseNumber ?? '');
      setYearsOfExperience(String(initial.yearsOfExperience ?? ''));
      setBasePrice(String(initial.basePrice ?? ''));
      setDefaultDurationMin(String(initial.defaultDurationMin ?? ''));
      setBio(initial.bio ?? '');
      setPhotoUrl(initial.photoUrl ?? '');
    } else {
      setEmail('');
      setPassword('');
      setFirstName('');
      setLastName('');
      setSpecializations('');
      setLanguages('');
      setLicenseNumber('');
      setYearsOfExperience('');
      setBasePrice('');
      setDefaultDurationMin('');
      setBio('');
      setPhotoUrl('');
    }
  }, [open, mode, initial]);

  const validate = (): string | null => {
    if (!firstName.trim()) return 'Вкажіть імʼя';
    if (!lastName.trim()) return 'Вкажіть прізвище';
    if (splitCsv(specializations).length === 0) {
      return 'Вкажіть хоча б одну спеціалізацію';
    }
    if (mode === 'create') {
      if (!email.trim()) return 'Вкажіть email';
      if (password.length < 8) return 'Пароль має містити щонайменше 8 символів';
    }
    return null;
  };

  const submit = () => {
    setTouched(true);
    const validationError = validate();
    if (validationError) return;

    const yearsNum = yearsOfExperience.trim() === '' ? undefined : Number(yearsOfExperience);
    const priceNum = basePrice.trim() === '' ? undefined : Number(basePrice);
    const durationNum =
      defaultDurationMin.trim() === '' ? undefined : Number(defaultDurationMin);

    if (mode === 'create') {
      const dto: CreateDoctorDto = {
        email: email.trim(),
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        specializations: splitCsv(specializations),
        languages: splitCsv(languages),
        licenseNumber: licenseNumber.trim() || undefined,
        yearsOfExperience: yearsNum,
        basePrice: priceNum,
        defaultDurationMin: durationNum,
        bio: bio.trim() || undefined,
        photoUrl: photoUrl.trim() || undefined,
      };
      onSubmitCreate(dto);
    } else {
      const dto: UpdateDoctorDto = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        specializations: splitCsv(specializations),
        languages: splitCsv(languages),
        licenseNumber: licenseNumber.trim() || undefined,
        yearsOfExperience: yearsNum,
        basePrice: priceNum,
        defaultDurationMin: durationNum,
        bio: bio.trim(),
        photoUrl: photoUrl.trim(),
      };
      onSubmitUpdate(dto);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit();
  };

  const validationError = touched ? validate() : null;
  const apiErrorText = errorMessage(error);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'create' ? 'Додати лікаря' : 'Редагувати лікаря'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            Скасувати
          </Button>
          <Button onClick={submit} isLoading={isPending}>
            {mode === 'create' ? 'Створити' : 'Зберегти'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-1">
        {validationError ? (
          <div className="mb-3">
            <Alert variant="warning">{validationError}</Alert>
          </div>
        ) : null}
        {apiErrorText ? (
          <div className="mb-3">
            <Alert variant="danger">{apiErrorText}</Alert>
          </div>
        ) : null}

        {mode === 'create' ? (
          <>
            <FormField label="Email">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="doctor@example.com"
              />
            </FormField>
            <FormField label="Пароль" hint="Мінімум 8 символів">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </FormField>
          </>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Імʼя">
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </FormField>
          <FormField label="Прізвище">
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </FormField>
        </div>

        <FormField label="Спеціалізації" hint="Через кому, наприклад: Терапевт, Кардіолог">
          <Input
            value={specializations}
            onChange={(e) => setSpecializations(e.target.value)}
          />
        </FormField>

        <FormField label="Мови" hint="Через кому, наприклад: uk, en">
          <Input value={languages} onChange={(e) => setLanguages(e.target.value)} />
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

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Базова ціна (₴)">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={basePrice}
              onChange={(e) => setBasePrice(e.target.value)}
            />
          </FormField>
          <FormField label="Тривалість прийому (хв)">
            <Input
              type="number"
              min={5}
              value={defaultDurationMin}
              onChange={(e) => setDefaultDurationMin(e.target.value)}
            />
          </FormField>
        </div>

        <FormField label="URL фото">
          <Input value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} />
        </FormField>

        <FormField label="Біографія">
          <Textarea
            rows={3}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
          />
        </FormField>

        <button type="submit" hidden />
      </form>
    </Modal>
  );
};
