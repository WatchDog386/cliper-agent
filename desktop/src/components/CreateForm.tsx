import { colors, desk } from '../theme';

export function CreateForm() {
  return (
    <section style={{ marginTop: '2rem' }}>
      <h3 style={{
        fontFamily: 'Inter, sans-serif',
        fontWeight: 600,
        fontSize: '1.25rem',
        color: colors.primary,
        marginBottom: '1rem',
      }}>
        Create New Clip
      </h3>
      <form style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        maxWidth: 500,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label htmlFor="url" style={{
            fontFamily: 'Inter, sans-serif',
            fontWeight: 500,
            fontSize: '0.875rem',
            color: colors.text,
          }}>
            Video URL
          </label>
          <input
            id="url"
            type="url"
            placeholder="https://youtu.be/..."
            style={{
              padding: '0.75rem 1rem',
              border: `1px solid ${colors.border}`,
              borderRadius: 6,
              fontFamily: 'Inter, sans-serif',
              fontSize: '0.875rem',
            }}
          />
        </div>
        <button type="submit" style={{
          padding: '0.75rem 1.5rem',
          backgroundColor: desk.green,
          color: '#FFFFFF',
          border: 'none',
          borderRadius: 6,
          fontFamily: 'Inter, sans-serif',
          fontWeight: 600,
          fontSize: '0.875rem',
          cursor: 'pointer',
        }}>
          Create Clip
        </button>
      </form>
    </section>
  );
}