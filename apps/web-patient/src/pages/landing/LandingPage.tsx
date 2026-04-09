import { Link } from 'react-router-dom';
import { Button, Card, PageHeader } from '@telemed/ui';

export const LandingPage = () => (
  <div className="space-y-8">
    <PageHeader
      title="Дистанційна медична допомога"
      description="Запис до перевірених лікарів, відеоконсультація і електронні документи в одному місці."
      actions={
        <Link to="/doctors">
          <Button>Знайти лікаря</Button>
        </Link>
      }
    />
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <Card>
        <h3 className="mb-2 font-semibold">1. Знайдіть лікаря</h3>
        <p className="text-sm text-slate-600">
          За спеціальністю, мовою консультації або найближчим вільним часом.
        </p>
      </Card>
      <Card>
        <h3 className="mb-2 font-semibold">2. Запишіться і сплатіть</h3>
        <p className="text-sm text-slate-600">Безпечна оплата картою. Підтвердження одразу.</p>
      </Card>
      <Card>
        <h3 className="mb-2 font-semibold">3. Підключіться до відеовізиту</h3>
        <p className="text-sm text-slate-600">
          Отримайте електронне заключення, рецепт і направлення в особистому кабінеті.
        </p>
      </Card>
    </div>
  </div>
);
