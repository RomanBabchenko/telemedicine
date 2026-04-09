import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ReferralTargetType } from '@telemed/shared-types';
import { consultationApi, documentsApi } from '@telemed/api-client';
import {
  Alert,
  Badge,
  Button,
  Card,
  FormField,
  Input,
  PageHeader,
  Select,
  Spinner,
  Textarea,
} from '@telemed/ui';
import { apiClient } from '../../lib/api';

const consultation = consultationApi(apiClient);
const documents = documentsApi(apiClient);

export const ConsultationFinishPage = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [diagnosis, setDiagnosis] = useState('');
  const [recommendations, setRecommendations] = useState('');
  const [drug, setDrug] = useState('');
  const [dosage, setDosage] = useState('1 таблетка');
  const [frequency, setFrequency] = useState('3 рази на день');
  const [referralType, setReferralType] = useState<ReferralTargetType>(ReferralTargetType.LAB);
  const [referralInstructions, setReferralInstructions] = useState('');
  const [done, setDone] = useState(false);

  const sessionQ = useQuery({
    queryKey: ['session-finish', sessionId],
    queryFn: () => consultation.getById(sessionId!),
    enabled: !!sessionId,
  });

  const finishM = useMutation({
    mutationFn: async () => {
      if (!sessionQ.data) throw new Error('Сесію не знайдено');
      const appointmentId = sessionQ.data.appointmentId;

      // 1. Conclusion
      const doc = await documents.createConclusion(appointmentId, {
        diagnosis,
        recommendations,
      });
      await documents.signDocument(doc.id);

      // 2. Prescription if any
      if (drug.trim()) {
        const presc = await documents.createPrescription(appointmentId, {
          items: [
            {
              drug,
              dosage,
              frequency,
              durationDays: 7,
            },
          ],
        });
        await documents.signPrescription(presc.id);
      }

      // 3. Referral if any
      if (referralInstructions.trim()) {
        await documents.createReferral(appointmentId, {
          targetType: referralType,
          instructions: referralInstructions,
        });
      }

      // 4. End session
      await consultation.end(sessionQ.data.id);
    },
    onSuccess: () => setDone(true),
  });

  if (sessionQ.isLoading) return <Spinner />;

  if (done) {
    return (
      <div className="space-y-6">
        <PageHeader title="Документи оформлено" />
        <Card>
          <Alert variant="success" title="Готово">
            Усі документи підписані та надіслані пацієнту.
          </Alert>
          <div className="mt-4">
            <Button onClick={() => navigate('/')}>На дашборд</Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Завершення консультації" description="Заповніть медичні документи" />

      <Card>
        <h3 className="mb-3 text-base font-semibold">Заключення</h3>
        <FormField label="Діагноз">
          <Input value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} />
        </FormField>
        <FormField label="Рекомендації">
          <Textarea
            rows={4}
            value={recommendations}
            onChange={(e) => setRecommendations(e.target.value)}
          />
        </FormField>
      </Card>

      <Card>
        <h3 className="mb-3 text-base font-semibold">Рецепт (опційно)</h3>
        <FormField label="Препарат">
          <Input value={drug} onChange={(e) => setDrug(e.target.value)} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Дозування">
            <Input value={dosage} onChange={(e) => setDosage(e.target.value)} />
          </FormField>
          <FormField label="Частота">
            <Input value={frequency} onChange={(e) => setFrequency(e.target.value)} />
          </FormField>
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 text-base font-semibold">Направлення (опційно)</h3>
        <FormField label="Тип направлення">
          <Select
            value={referralType}
            onChange={(e) => setReferralType(e.target.value as ReferralTargetType)}
          >
            <option value="LAB">Лабораторне обстеження</option>
            <option value="IMAGING">УЗД / КТ / МРТ</option>
            <option value="SPECIALIST">Інший спеціаліст</option>
            <option value="IN_PERSON">Очний прийом</option>
          </Select>
        </FormField>
        <FormField label="Інструкції">
          <Textarea
            rows={3}
            value={referralInstructions}
            onChange={(e) => setReferralInstructions(e.target.value)}
          />
        </FormField>
      </Card>

      <Badge>Сесія: {sessionId}</Badge>

      <div className="flex justify-end">
        <Button onClick={() => finishM.mutate()} isLoading={finishM.isPending}>
          Підписати та надіслати
        </Button>
      </div>
    </div>
  );
};
