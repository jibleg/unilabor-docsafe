import type { Response } from 'express';
import type { AuthRequest } from '../types';
import {
  createProvider,
  createProviderContact,
  createProviderDocumentCategory,
  deactivateProvider,
  deactivateProviderDocumentCategory,
  deleteProviderContact,
  deleteProviderDocumentCategory,
  listProviderContacts,
  listProviderDocumentCategories,
  listProviders,
  updateProvider,
  updateProviderContact,
  updateProviderDocumentCategory,
} from '../services/provider-catalog.service';
import { getNumberId, getText, mapProviderCatalogError, mapProviderError } from './provider-controller.shared';

const parseBooleanQuery = (value: unknown): boolean => {
  if (typeof value !== 'string') {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
};

export const listProvidersController = async (req: AuthRequest, res: Response) => {
  try {
    const result = await listProviders({
      page: req.query.page,
      limit: req.query.limit,
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      includeInactive: parseBooleanQuery(req.query.includeInactive),
    });
    return res.json(result);
  } catch (error) {
    console.error('Error listando proveedores:', error);
    return res.status(500).json({ message: 'No se pudieron cargar los proveedores.' });
  }
};

const getProviderPayloadFromBody = (body: any, name: string) => ({
  name,
  description: getText(body?.description),
  rfc: getText(body?.rfc),
  contact: getText(body?.contact),
  website: getText(body?.website),
  address_street: getText(body?.address_street),
  address_neighborhood: getText(body?.address_neighborhood),
  address_city: getText(body?.address_city),
  address_state: getText(body?.address_state),
  address_zip: getText(body?.address_zip),
  address_country: getText(body?.address_country),
  notes: getText(body?.notes),
});

export const createProviderController = async (req: AuthRequest, res: Response) => {
  const name = getText(req.body?.name);
  if (!name) {
    return res.status(400).json({ message: 'El nombre del proveedor es obligatorio.' });
  }

  try {
    const provider = await createProvider(getProviderPayloadFromBody(req.body, name));

    return res.status(201).json({ message: 'Proveedor creado correctamente.', provider });
  } catch (error: any) {
    const mappedError = mapProviderError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error creando proveedor:', error);
    return res.status(500).json({ message: 'No se pudo crear el proveedor.' });
  }
};

export const updateProviderController = async (req: AuthRequest, res: Response) => {
  const providerId = getNumberId(req.params.id);
  const name = getText(req.body?.name);
  if (!providerId) {
    return res.status(400).json({ message: 'ID de proveedor invalido.' });
  }
  if (!name) {
    return res.status(400).json({ message: 'El nombre del proveedor es obligatorio.' });
  }

  try {
    const provider = await updateProvider(providerId, getProviderPayloadFromBody(req.body, name));

    if (!provider) {
      return res.status(404).json({ message: 'Proveedor no encontrado.' });
    }

    return res.json({ message: 'Proveedor actualizado correctamente.', provider });
  } catch (error: any) {
    const mappedError = mapProviderError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error actualizando proveedor:', error);
    return res.status(500).json({ message: 'No se pudo actualizar el proveedor.' });
  }
};

export const deactivateProviderController = async (req: AuthRequest, res: Response) => {
  const providerId = getNumberId(req.params.id);
  if (!providerId) {
    return res.status(400).json({ message: 'ID de proveedor invalido.' });
  }

  try {
    const provider = await deactivateProvider(providerId);
    if (!provider) {
      return res.status(404).json({ message: 'Proveedor no encontrado.' });
    }

    return res.json({ message: 'Proveedor desactivado correctamente.', provider });
  } catch (error) {
    console.error('Error desactivando proveedor:', error);
    return res.status(500).json({ message: 'No se pudo desactivar el proveedor.' });
  }
};

export const listProviderContactsController = async (req: AuthRequest, res: Response) => {
  const providerId = getNumberId(req.params.id);
  if (!providerId) {
    return res.status(400).json({ message: 'ID de proveedor invalido.' });
  }

  try {
    const contacts = await listProviderContacts(providerId);
    return res.json({ contacts });
  } catch (error) {
    console.error('Error listando contactos de proveedor:', error);
    return res.status(500).json({ message: 'No se pudieron cargar los contactos.' });
  }
};

export const createProviderContactController = async (req: AuthRequest, res: Response) => {
  const providerId = getNumberId(req.params.id);
  const name = getText(req.body?.name);
  if (!providerId) {
    return res.status(400).json({ message: 'ID de proveedor invalido.' });
  }
  if (!name) {
    return res.status(400).json({ message: 'El nombre del contacto es obligatorio.' });
  }

  try {
    const contact = await createProviderContact(providerId, {
      name,
      position: getText(req.body?.position),
      phone: getText(req.body?.phone),
      email: getText(req.body?.email),
      is_primary: Boolean(req.body?.is_primary),
    });

    return res.status(201).json({ message: 'Contacto agregado correctamente.', contact });
  } catch (error: any) {
    const mappedError = mapProviderError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error creando contacto de proveedor:', error);
    return res.status(500).json({ message: 'No se pudo agregar el contacto.' });
  }
};

export const updateProviderContactController = async (req: AuthRequest, res: Response) => {
  const contactId = getNumberId(req.params.id);
  const name = getText(req.body?.name);
  if (!contactId) {
    return res.status(400).json({ message: 'ID de contacto invalido.' });
  }
  if (!name) {
    return res.status(400).json({ message: 'El nombre del contacto es obligatorio.' });
  }

  try {
    const contact = await updateProviderContact(contactId, {
      name,
      position: getText(req.body?.position),
      phone: getText(req.body?.phone),
      email: getText(req.body?.email),
      is_primary: Boolean(req.body?.is_primary),
    });

    if (!contact) {
      return res.status(404).json({ message: 'Contacto no encontrado.' });
    }

    return res.json({ message: 'Contacto actualizado correctamente.', contact });
  } catch (error: any) {
    const mappedError = mapProviderError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error actualizando contacto de proveedor:', error);
    return res.status(500).json({ message: 'No se pudo actualizar el contacto.' });
  }
};

export const deleteProviderContactController = async (req: AuthRequest, res: Response) => {
  const contactId = getNumberId(req.params.id);
  if (!contactId) {
    return res.status(400).json({ message: 'ID de contacto invalido.' });
  }

  try {
    const removed = await deleteProviderContact(contactId);
    if (!removed) {
      return res.status(404).json({ message: 'Contacto no encontrado.' });
    }

    return res.json({ message: 'Contacto eliminado correctamente.' });
  } catch (error) {
    console.error('Error eliminando contacto de proveedor:', error);
    return res.status(500).json({ message: 'No se pudo eliminar el contacto.' });
  }
};

export const listProviderDocumentCategoriesController = async (req: AuthRequest, res: Response) => {
  try {
    const includeInactive = parseBooleanQuery(req.query.includeInactive);
    const categories = await listProviderDocumentCategories(includeInactive);
    return res.json({ categories });
  } catch (error) {
    console.error('Error listando categorias de documento de proveedor:', error);
    return res.status(500).json({ message: 'No se pudieron cargar las categorias.' });
  }
};

export const createProviderDocumentCategoryController = async (req: AuthRequest, res: Response) => {
  const name = getText(req.body?.name);
  if (!name) {
    return res.status(400).json({ message: 'El nombre de la categoria es obligatorio.' });
  }

  try {
    const category = await createProviderDocumentCategory({
      code: getText(req.body?.code),
      name,
      description: getText(req.body?.description),
      sort_order: req.body?.sort_order === undefined ? null : Number(req.body?.sort_order),
    });

    return res.status(201).json({ message: 'Categoria creada correctamente.', category });
  } catch (error: any) {
    const mappedError = mapProviderCatalogError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error creando categoria de documento de proveedor:', error);
    return res.status(500).json({ message: 'No se pudo crear la categoria.' });
  }
};

export const updateProviderDocumentCategoryController = async (req: AuthRequest, res: Response) => {
  const categoryId = getNumberId(req.params.id);
  const name = getText(req.body?.name);
  if (!categoryId) {
    return res.status(400).json({ message: 'ID de categoria invalido.' });
  }
  if (!name) {
    return res.status(400).json({ message: 'El nombre de la categoria es obligatorio.' });
  }

  try {
    const category = await updateProviderDocumentCategory(categoryId, {
      code: getText(req.body?.code),
      name,
      description: getText(req.body?.description),
      sort_order: req.body?.sort_order === undefined ? null : Number(req.body?.sort_order),
    });

    if (!category) {
      return res.status(404).json({ message: 'Categoria no encontrada.' });
    }

    return res.json({ message: 'Categoria actualizada correctamente.', category });
  } catch (error: any) {
    const mappedError = mapProviderCatalogError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error actualizando categoria de documento de proveedor:', error);
    return res.status(500).json({ message: 'No se pudo actualizar la categoria.' });
  }
};

export const deactivateProviderDocumentCategoryController = async (req: AuthRequest, res: Response) => {
  const categoryId = getNumberId(req.params.id);
  if (!categoryId) {
    return res.status(400).json({ message: 'ID de categoria invalido.' });
  }

  try {
    const category = await deactivateProviderDocumentCategory(categoryId);
    if (!category) {
      return res.status(404).json({ message: 'Categoria no encontrada.' });
    }

    return res.json({ message: 'Categoria desactivada correctamente.', category });
  } catch (error) {
    console.error('Error desactivando categoria de documento de proveedor:', error);
    return res.status(500).json({ message: 'No se pudo desactivar la categoria.' });
  }
};

export const deleteProviderDocumentCategoryController = async (req: AuthRequest, res: Response) => {
  const categoryId = getNumberId(req.params.id);
  if (!categoryId) {
    return res.status(400).json({ message: 'ID de categoria invalido.' });
  }

  try {
    const removed = await deleteProviderDocumentCategory(categoryId);
    if (!removed) {
      return res.status(404).json({ message: 'Categoria no encontrada.' });
    }

    return res.json({ message: 'Categoria eliminada definitivamente.' });
  } catch (error: any) {
    if (error?.code === '23503') {
      return res.status(409).json({
        message: 'No se puede eliminar: hay documentos que usan esta categoria. Puedes desactivarla en su lugar.',
      });
    }

    console.error('Error eliminando categoria de documento de proveedor:', error);
    return res.status(500).json({ message: 'No se pudo eliminar la categoria.' });
  }
};
