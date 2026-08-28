import pool from '../config/db';

/**
 * Catalogo minimo de puesto/categoria (REH-MAN-001) para el modulo de
 * induccion: nombre + competencias tecnicas + documentos obligatorios. NO
 * replica la ficha completa del manual (mision, autoridades, requisitos...),
 * a proposito (decision de alcance del usuario).
 */

const throwCoded = (code: string, publicMessage?: string): never => {
  const error = new Error(code);
  (error as any).code = code;
  if (publicMessage) {
    (error as any).publicMessage = publicMessage;
  }
  throw error;
};

export interface RhPositionCompetency {
  id: number;
  competency_text: string;
  sort_order: number;
}

export interface RhPositionDocument {
  id: number;
  document_id: string;
  title: string;
  code: string | null;
  sort_order: number;
}

export interface RhPositionRecord {
  id: number;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  competencies: RhPositionCompetency[];
  documents: RhPositionDocument[];
  created_at: string;
  updated_at: string;
}

export interface RhPositionPayload {
  code: string;
  name: string;
  description?: string | null;
  sort_order?: number | null;
}

const mapPosition = (row: any): Omit<RhPositionRecord, 'competencies' | 'documents'> => ({
  id: Number(row.id),
  code: String(row.code),
  name: String(row.name),
  description: row.description ? String(row.description) : null,
  is_active: Boolean(row.is_active),
  sort_order: Number(row.sort_order ?? 0),
  created_at: String(row.created_at),
  updated_at: String(row.updated_at),
});

const loadCompetencies = async (positionId: number): Promise<RhPositionCompetency[]> => {
  const result = await pool.query(
    `SELECT id, competency_text, sort_order FROM public.rh_position_competencies
      WHERE position_id = $1 ORDER BY sort_order ASC, id ASC;`,
    [positionId],
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    competency_text: String(row.competency_text),
    sort_order: Number(row.sort_order ?? 0),
  }));
};

const loadDocuments = async (positionId: number): Promise<RhPositionDocument[]> => {
  const result = await pool.query(
    `SELECT pd.id, pd.document_id, pd.sort_order, d.title, d.code
       FROM public.rh_position_documents pd
       INNER JOIN public.documents d ON d.id = pd.document_id
      WHERE pd.position_id = $1
      ORDER BY pd.sort_order ASC, pd.id ASC;`,
    [positionId],
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    document_id: String(row.document_id),
    title: String(row.title),
    code: row.code ? String(row.code) : null,
    sort_order: Number(row.sort_order ?? 0),
  }));
};

const hydrate = async (row: any): Promise<RhPositionRecord> => {
  const base = mapPosition(row);
  const [competencies, documents] = await Promise.all([
    loadCompetencies(base.id),
    loadDocuments(base.id),
  ]);
  return { ...base, competencies, documents };
};

export const listPositions = async (includeInactive = false): Promise<RhPositionRecord[]> => {
  const whereClause = includeInactive ? '' : 'WHERE is_active = TRUE';
  const result = await pool.query(
    `SELECT * FROM public.rh_positions ${whereClause} ORDER BY sort_order ASC, name ASC;`,
  );
  return Promise.all(result.rows.map(hydrate));
};

export const getPositionById = async (id: number): Promise<RhPositionRecord | null> => {
  const result = await pool.query(`SELECT * FROM public.rh_positions WHERE id = $1 LIMIT 1;`, [id]);
  if (result.rows.length === 0) {
    return null;
  }
  return hydrate(result.rows[0]);
};

export const createPosition = async (payload: RhPositionPayload): Promise<RhPositionRecord> => {
  const code = payload.code.trim();
  const name = payload.name.trim();
  if (!code || !name) {
    throwCoded('RH_POSITION_INVALID', 'Codigo y nombre del puesto son obligatorios.');
  }
  try {
    const result = await pool.query(
      `INSERT INTO public.rh_positions (code, name, description, sort_order)
       VALUES ($1, $2, $3, $4) RETURNING id;`,
      [code, name, payload.description?.trim() || null, payload.sort_order ?? 0],
    );
    return (await getPositionById(Number(result.rows[0].id)))!;
  } catch (error: any) {
    if (error?.code === '23505') {
      throwCoded('RH_POSITION_CODE_TAKEN', 'Ya existe un puesto con ese codigo.');
    }
    throw error;
  }
};

export const updatePosition = async (
  id: number,
  payload: Partial<RhPositionPayload> & { is_active?: boolean },
): Promise<RhPositionRecord | null> => {
  const existing = await getPositionById(id);
  if (!existing) {
    return null;
  }
  try {
    await pool.query(
      `UPDATE public.rh_positions
          SET code = $1, name = $2, description = $3, sort_order = $4,
              is_active = $5, updated_at = NOW()
        WHERE id = $6;`,
      [
        (payload.code ?? existing.code).trim(),
        (payload.name ?? existing.name).trim(),
        payload.description !== undefined ? payload.description?.trim() || null : existing.description,
        payload.sort_order ?? existing.sort_order,
        payload.is_active ?? existing.is_active,
        id,
      ],
    );
    return getPositionById(id);
  } catch (error: any) {
    if (error?.code === '23505') {
      throwCoded('RH_POSITION_CODE_TAKEN', 'Ya existe un puesto con ese codigo.');
    }
    throw error;
  }
};

export const deletePosition = async (id: number): Promise<boolean> => {
  try {
    const result = await pool.query(`DELETE FROM public.rh_positions WHERE id = $1;`, [id]);
    return (result.rowCount ?? 0) > 0;
  } catch (error: any) {
    if (error?.code === '23503') {
      throwCoded(
        'RH_POSITION_IN_USE',
        'No se puede eliminar: el puesto tiene colaboradores asignados o esta ligado a una fase de induccion.',
      );
    }
    throw error;
  }
};

export const addPositionCompetency = async (
  positionId: number,
  competencyText: string,
  sortOrder = 0,
): Promise<RhPositionCompetency> => {
  const text = competencyText.trim();
  if (!text) {
    throwCoded('RH_POSITION_COMPETENCY_INVALID', 'La competencia no puede estar vacia.');
  }
  const result = await pool.query(
    `INSERT INTO public.rh_position_competencies (position_id, competency_text, sort_order)
     VALUES ($1, $2, $3) RETURNING id, competency_text, sort_order;`,
    [positionId, text, sortOrder],
  );
  const row = result.rows[0];
  return { id: Number(row.id), competency_text: String(row.competency_text), sort_order: Number(row.sort_order ?? 0) };
};

export const deletePositionCompetency = async (competencyId: number): Promise<boolean> => {
  const result = await pool.query(`DELETE FROM public.rh_position_competencies WHERE id = $1;`, [competencyId]);
  return (result.rowCount ?? 0) > 0;
};

/** Busca un documento vigente por su codigo SGC (ej. "REH-INS-001"), sin distinguir mayusculas. */
export const findDocumentByCode = async (
  code: string,
): Promise<{ id: string; title: string; code: string } | null> => {
  const result = await pool.query(
    `SELECT id, title, code FROM public.documents
      WHERE UPPER(code) = UPPER($1) AND status = 'active' LIMIT 1;`,
    [code.trim()],
  );
  if (result.rows.length === 0) {
    return null;
  }
  const row = result.rows[0];
  return { id: String(row.id), title: String(row.title), code: String(row.code) };
};

export const addPositionDocument = async (
  positionId: number,
  documentId: string,
  sortOrder = 0,
): Promise<RhPositionDocument> => {
  try {
    const result = await pool.query(
      `INSERT INTO public.rh_position_documents (position_id, document_id, sort_order)
       VALUES ($1, $2, $3) RETURNING id;`,
      [positionId, documentId, sortOrder],
    );
    const documents = await loadDocuments(positionId);
    const created = documents.find((doc) => doc.id === Number(result.rows[0].id));
    if (!created) {
      return throwCoded('RH_POSITION_DOCUMENT_CREATION_FAILED');
    }
    return created;
  } catch (error: any) {
    if (error?.code === '23505') {
      throwCoded('RH_POSITION_DOCUMENT_DUPLICATE', 'Ese documento ya esta asignado a este puesto.');
    }
    if (error?.code === '23503') {
      throwCoded('RH_POSITION_DOCUMENT_NOT_FOUND', 'El puesto o el documento no existen.');
    }
    throw error;
  }
};

export const removePositionDocument = async (positionDocumentId: number): Promise<boolean> => {
  const result = await pool.query(`DELETE FROM public.rh_position_documents WHERE id = $1;`, [positionDocumentId]);
  return (result.rowCount ?? 0) > 0;
};
