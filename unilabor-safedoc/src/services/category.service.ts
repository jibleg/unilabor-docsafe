import pool from '../config/db';
import { UserRole } from '../types';
import { isViewerProtectedCategoryName } from '../policies/viewer-access.policy';

export interface CategoryRecord {
  id: number;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CategoryPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface CategoryPageResult {
  data: CategoryRecord[];
  pagination: CategoryPagination;
}

interface CategoryListOptions {
  page: number;
  limit: number;
  search?: string;
  includeInactive?: boolean;
}

let categoryStatusColumnAvailable: boolean | null = null;
let userCategoriesTableAvailable: boolean | null = null;

const maxPageSize = 100;

const asPositiveInt = (value: unknown, fallbackValue: number): number => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallbackValue;
  }
  return parsed;
};

const resolveCategoryStatusColumn = async (): Promise<boolean> => {
  if (categoryStatusColumnAvailable !== null) {
    return categoryStatusColumnAvailable;
  }

  const query = `
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'categories'
        AND column_name = 'is_active'
    ) AS exists;
  `;

  const result = await pool.query(query);
  categoryStatusColumnAvailable = Boolean(result.rows[0]?.exists);
  return categoryStatusColumnAvailable;
};

const resolveUserCategoriesTable = async (): Promise<boolean> => {
  if (userCategoriesTableAvailable !== null) {
    return userCategoriesTableAvailable;
  }

  const query = `SELECT to_regclass('public.user_categories') IS NOT NULL AS exists;`;
  const result = await pool.query(query);
  userCategoriesTableAvailable = Boolean(result.rows[0]?.exists);
  return userCategoriesTableAvailable;
};

const categorySelect = (includeStatusColumn: boolean): string => {
  if (includeStatusColumn) {
    return `
      c.id,
      c.name,
      c.is_active,
      c.created_at,
      c.updated_at
    `;
  }

  return `
    c.id,
    c.name,
    TRUE::boolean AS is_active,
    NOW() AS created_at,
    NOW() AS updated_at
  `;
};

const buildCategoryWhereClause = (
  includeStatusColumn: boolean,
  includeInactive: boolean,
  search?: string
) => {
  const clauses: string[] = [];
  const values: unknown[] = [];

  if (search && search.trim().length > 0) {
    values.push(`%${search.trim()}%`);
    clauses.push(`c.name ILIKE $${values.length}`);
  }

  if (includeStatusColumn && !includeInactive) {
    clauses.push('c.is_active = TRUE');
  }

  return {
    whereClause: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
    values,
  };
};

export const getCategoriesPaginated = async (options: CategoryListOptions): Promise<CategoryPageResult> => {
  const includeStatusColumn = await resolveCategoryStatusColumn();
  const page = asPositiveInt(options.page, 1);
  const limit = Math.min(asPositiveInt(options.limit, 10), maxPageSize);
  const includeInactive = Boolean(options.includeInactive);
  const offset = (page - 1) * limit;

  const { whereClause, values } = buildCategoryWhereClause(
    includeStatusColumn,
    includeInactive,
    options.search
  );

  const dataQuery = `
    SELECT ${categorySelect(includeStatusColumn)}
    FROM categories c
    ${whereClause}
    ORDER BY c.name ASC
    LIMIT $${values.length + 1}
    OFFSET $${values.length + 2};
  `;

  const countQuery = `
    SELECT COUNT(*) AS total
    FROM categories c
    ${whereClause};
  `;

  const dataValues = [...values, limit, offset];
  const [dataResult, countResult] = await Promise.all([
    pool.query(dataQuery, dataValues),
    pool.query(countQuery, values),
  ]);

  const total = Number.parseInt(String(countResult.rows[0]?.total ?? 0), 10);
  const totalPages = total > 0 ? Math.ceil(total / limit) : 1;

  return {
    data: dataResult.rows,
    pagination: {
      page,
      limit,
      total,
      totalPages,
    },
  };
};

export const getCategoryById = async (categoryId: number): Promise<CategoryRecord | null> => {
  const includeStatusColumn = await resolveCategoryStatusColumn();

  const query = `
    SELECT ${categorySelect(includeStatusColumn)}
    FROM categories c
    WHERE c.id = $1
    LIMIT 1;
  `;

  const result = await pool.query(query, [categoryId]);
  return result.rows[0] ?? null;
};

export const createCategory = async (name: string): Promise<CategoryRecord> => {
  const includeStatusColumn = await resolveCategoryStatusColumn();
  const sanitizedName = name.trim();

  if (includeStatusColumn) {
    const query = `
      INSERT INTO categories (name, is_active, created_at, updated_at)
      VALUES ($1, TRUE, NOW(), NOW())
      RETURNING id, name, is_active, created_at, updated_at;
    `;
    const result = await pool.query(query, [sanitizedName]);
    return result.rows[0];
  }

  const query = `
    INSERT INTO categories (name)
    VALUES ($1)
    RETURNING
      id,
      name,
      TRUE::boolean AS is_active,
      NOW() AS created_at,
      NOW() AS updated_at;
  `;
  const result = await pool.query(query, [sanitizedName]);
  return result.rows[0];
};

export const updateCategory = async (categoryId: number, name: string): Promise<CategoryRecord | null> => {
  const includeStatusColumn = await resolveCategoryStatusColumn();
  const sanitizedName = name.trim();

  if (includeStatusColumn) {
    const query = `
      UPDATE categories
      SET name = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id, name, is_active, created_at, updated_at;
    `;

    const result = await pool.query(query, [sanitizedName, categoryId]);
    return result.rows[0] ?? null;
  }

  const query = `
    UPDATE categories
    SET name = $1
    WHERE id = $2
    RETURNING
      id,
      name,
      TRUE::boolean AS is_active,
      NOW() AS created_at,
      NOW() AS updated_at;
  `;

  const result = await pool.query(query, [sanitizedName, categoryId]);
  return result.rows[0] ?? null;
};

export const setCategoryStatus = async (categoryId: number, isActive: boolean): Promise<CategoryRecord | null> => {
  const includeStatusColumn = await resolveCategoryStatusColumn();

  if (!includeStatusColumn) {
    const missingColumnError = new Error('CATEGORY_STATUS_COLUMN_NOT_AVAILABLE');
    (missingColumnError as any).code = 'CATEGORY_STATUS_COLUMN_NOT_AVAILABLE';
    throw missingColumnError;
  }

  const query = `
    UPDATE categories
    SET is_active = $1, updated_at = NOW()
    WHERE id = $2
    RETURNING id, name, is_active, created_at, updated_at;
  `;

  const result = await pool.query(query, [isActive, categoryId]);
  return result.rows[0] ?? null;
};

export const listCategoriesForUser = async (userId: string, role: UserRole): Promise<CategoryRecord[]> => {
  const includeStatusColumn = await resolveCategoryStatusColumn();
  const categoryStatusFilter = includeStatusColumn ? 'AND c.is_active = TRUE' : '';

  if (role === 'ADMIN') {
    const query = `
      SELECT ${categorySelect(includeStatusColumn)}
      FROM categories c
      WHERE 1 = 1
      ${categoryStatusFilter}
      ORDER BY c.name ASC;
    `;
    const result = await pool.query(query);
    return result.rows;
  }

  if (role === 'EDITOR') {
    const hasTable = await resolveUserCategoriesTable();
    if (!hasTable) {
      const query = `
        SELECT ${categorySelect(includeStatusColumn)}
        FROM categories c
        WHERE 1 = 1
        ${categoryStatusFilter}
        ORDER BY c.name ASC;
      `;
      const result = await pool.query(query);
      return result.rows;
    }

    const assignmentCount = await getUserCategoryAssignmentCount(userId);
    if (assignmentCount === 0) {
      const query = `
        SELECT ${categorySelect(includeStatusColumn)}
        FROM categories c
        WHERE 1 = 1
        ${categoryStatusFilter}
        ORDER BY c.name ASC;
      `;
      const result = await pool.query(query);
      return result.rows;
    }
  }

  const hasTable = await resolveUserCategoriesTable();
  if (!hasTable) {
    return [];
  }

  const query = `
    SELECT ${categorySelect(includeStatusColumn)}
    FROM categories c
    INNER JOIN user_categories uc ON uc.category_id = c.id
    WHERE uc.user_id = $1
    ${categoryStatusFilter}
    ORDER BY c.name ASC;
  `;

  const result = await pool.query(query, [userId]);
  if (role === 'VIEWER') {
    return result.rows.filter((category) => isViewerProtectedCategoryName(category.name));
  }

  return result.rows;
};

export const getUserCategories = async (userId: string): Promise<CategoryRecord[]> => {
  const includeStatusColumn = await resolveCategoryStatusColumn();
  const hasTable = await resolveUserCategoriesTable();

  if (!hasTable) {
    return [];
  }

  const query = `
    SELECT ${categorySelect(includeStatusColumn)}
    FROM categories c
    INNER JOIN user_categories uc ON uc.category_id = c.id
    WHERE uc.user_id = $1
    ORDER BY c.name ASC;
  `;

  const result = await pool.query(query, [userId]);
  return result.rows;
};

export const replaceUserCategories = async (userId: string, categoryIds: number[]): Promise<CategoryRecord[]> => {
  const hasTable = await resolveUserCategoriesTable();
  if (!hasTable) {
    const missingTableError = new Error('USER_CATEGORIES_TABLE_NOT_AVAILABLE');
    (missingTableError as any).code = 'USER_CATEGORIES_TABLE_NOT_AVAILABLE';
    throw missingTableError;
  }

  const includeStatusColumn = await resolveCategoryStatusColumn();
  const uniqueCategoryIds = Array.from(new Set(categoryIds));

  const userResult = await pool.query('SELECT id FROM users WHERE id = $1 LIMIT 1', [userId]);
  if (userResult.rows.length === 0) {
    const missingUserError = new Error('USER_NOT_FOUND');
    (missingUserError as any).code = 'USER_NOT_FOUND';
    throw missingUserError;
  }

  if (uniqueCategoryIds.length > 0) {
    const targetUserResult = await pool.query(
      'SELECT role FROM users WHERE id = $1 LIMIT 1',
      [userId]
    );
    const targetUserRole = String(targetUserResult.rows[0]?.role ?? '').toUpperCase() as UserRole;

    if (targetUserRole === 'VIEWER') {
      const viewerCategoryPolicyQuery = `
        SELECT c.id, c.name
        FROM categories c
        WHERE c.id = ANY($1::int[]);
      `;
      const viewerCategoryPolicyResult = await pool.query(viewerCategoryPolicyQuery, [uniqueCategoryIds]);
      const invalidViewerCategories = viewerCategoryPolicyResult.rows.filter(
        (category) => !isViewerProtectedCategoryName(category.name)
      );

      if (invalidViewerCategories.length > 0) {
        const invalidViewerCategoryError = new Error('INVALID_VIEWER_CATEGORY_POLICY');
        (invalidViewerCategoryError as any).code = 'INVALID_VIEWER_CATEGORY_POLICY';
        throw invalidViewerCategoryError;
      }
    }

    const availabilityQuery = `
      SELECT COUNT(*)::int AS total
      FROM categories c
      WHERE c.id = ANY($1::int[])
      ${includeStatusColumn ? 'AND c.is_active = TRUE' : ''};
    `;
    const availabilityResult = await pool.query(availabilityQuery, [uniqueCategoryIds]);
    const existingCount = Number(availabilityResult.rows[0]?.total ?? 0);

    if (existingCount !== uniqueCategoryIds.length) {
      const invalidCategoryError = new Error('INVALID_CATEGORY_IDS');
      (invalidCategoryError as any).code = 'INVALID_CATEGORY_IDS';
      throw invalidCategoryError;
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query('DELETE FROM user_categories WHERE user_id = $1', [userId]);

    if (uniqueCategoryIds.length > 0) {
      await client.query(
        `
          INSERT INTO user_categories (user_id, category_id)
          SELECT $1, category_id
          FROM UNNEST($2::int[]) AS category_id
          ON CONFLICT (user_id, category_id) DO NOTHING;
        `,
        [userId, uniqueCategoryIds]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return getUserCategories(userId);
};

export const ensureActiveCategoryExists = async (categoryId: number): Promise<boolean> => {
  const includeStatusColumn = await resolveCategoryStatusColumn();

  const query = `
    SELECT id
    FROM categories
    WHERE id = $1
    ${includeStatusColumn ? 'AND is_active = TRUE' : ''}
    LIMIT 1;
  `;

  const result = await pool.query(query, [categoryId]);
  return result.rows.length > 0;
};

const getUserCategoryAssignmentCount = async (userId: string): Promise<number> => {
  const hasTable = await resolveUserCategoriesTable();
  if (!hasTable) {
    return 0;
  }

  const result = await pool.query(
    'SELECT COUNT(*)::int AS total FROM user_categories WHERE user_id = $1',
    [userId]
  );
  return Number(result.rows[0]?.total ?? 0);
};

const hasUserCategoryAssignment = async (userId: string, categoryId: number): Promise<boolean> => {
  const hasTable = await resolveUserCategoriesTable();
  if (!hasTable) {
    return false;
  }

  const result = await pool.query(
    `
      SELECT 1
      FROM user_categories
      WHERE user_id = $1
        AND category_id = $2
      LIMIT 1;
    `,
    [userId, categoryId]
  );

  return result.rows.length > 0;
};

export const canUserAccessCategory = async (
  userId: string,
  role: UserRole,
  categoryId: number
): Promise<boolean> => {
  if (role === 'ADMIN') {
    return true;
  }

  const isCategoryAvailable = await ensureActiveCategoryExists(categoryId);
  if (!isCategoryAvailable) {
    return false;
  }

  if (role === 'EDITOR') {
    const assignmentCount = await getUserCategoryAssignmentCount(userId);
    if (assignmentCount === 0) {
      return true;
    }
    return hasUserCategoryAssignment(userId, categoryId);
  }

  if (role === 'VIEWER') {
    const categoryResult = await pool.query(
      'SELECT name FROM categories WHERE id = $1 LIMIT 1',
      [categoryId]
    );
    const categoryName = String(categoryResult.rows[0]?.name ?? '');
    if (!isViewerProtectedCategoryName(categoryName)) {
      return false;
    }

    return hasUserCategoryAssignment(userId, categoryId);
  }

  return false;
};
