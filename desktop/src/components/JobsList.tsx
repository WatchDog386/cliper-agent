import { colors } from '../theme';

export function JobsList() {
  return (
    <section>
      <h2 style={{
        fontFamily: 'Inter, sans-serif',
        fontWeight: 700,
        fontSize: '2.25rem',
        color: colors.primary,
        marginBottom: '1.5rem',
      }}>
        Your Jobs
      </h2>
      <p style={{ color: '#6B7280' }}>No jobs yet. Create a clip to get started.</p>
    </section>
  );
}