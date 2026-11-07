import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
const getEmployeeById = vi.fn();
vi.mock('../config/db', () => ({ default: { query } }));
vi.mock('./employee.service', () => ({ getEmployeeById }));
vi.mock('./employee-document-access.service', () => ({ initializeDefaultEmployeeDocumentAccess: vi.fn() }));

const { listEmployeeDocumentHistory, updateEmployeeDocumentMetadata, uploadEmployeeDocument } = await import('./employee-document.service');

beforeEach(() => {
  query.mockReset();
  getEmployeeById.mockReset();
  query.mockImplementation(async (text: string) => (text.includes('to_regclass') ? { rows: [{ exists: true }] } : { rows: [] }));
  getEmployeeById.mockResolvedValue({ id: 1, is_active: false });
});

describe('expediente de un colaborador inactivo', () => {
  it('se puede consultar', async () => {
    query.mockImplementation(async (text: string) => {
      if (text.includes('to_regclass')) return { rows: [{ exists: true }] };
      if (text.includes('SELECT 1')) return { rows: [{ '?column?': 1 }] };
      return { rows: [] };
    });
    await expect(listEmployeeDocumentHistory(1, 5)).resolves.toEqual([]);
  });

  it('no admite cargar documentos', async () => {
    await expect(uploadEmployeeDocument(1, 'rh', {} as Express.Multer.File, { document_type_id: 5, title: 'x' } as never)).rejects.toMatchObject({
      code: 'EMPLOYEE_INACTIVE_READ_ONLY',
    });
  });

  it('no admite corregir datos de un documento', async () => {
    await expect(updateEmployeeDocumentMetadata(1, 9, 'rh', { title: 'x' })).rejects.toMatchObject({ code: 'EMPLOYEE_INACTIVE_READ_ONLY' });
    expect(query.mock.calls.some(([text]) => String(text).includes('UPDATE public.employee_documents'))).toBe(false);
  });

  it('un colaborador inexistente sigue siendo no encontrado', async () => {
    getEmployeeById.mockResolvedValue(null);
    await expect(listEmployeeDocumentHistory(99, 5)).rejects.toMatchObject({ code: 'EMPLOYEE_NOT_FOUND' });
  });
});
