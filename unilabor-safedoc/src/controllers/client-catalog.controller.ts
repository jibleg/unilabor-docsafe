import type { Response } from 'express';
import type { AuthRequest } from '../types';
import {
  createClient,
  createClientContact,
  createClientDocumentCategory,
  deactivateClient,
  deactivateClientDocumentCategory,
  deleteClientContact,
  deleteClientDocumentCategory,
  listClientContacts,
  listClientDocumentCategories,
  listClients,
  updateClient,
  updateClientContact,
  updateClientDocumentCategory,
} from '../services/client-catalog.service';
import { getNumberId, getText, mapClientCatalogError, mapClientError } from './client-controller.shared';

const parseBooleanQuery = (value: unknown): boolean => {
  if (typeof value !== 'string') {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
};

export const listClientsController = async (req: AuthRequest, res: Response) => {
  try {
    const result = await listClients({
      page: req.query.page,
      limit: req.query.limit,
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      includeInactive: parseBooleanQuery(req.query.includeInactive),
      classificationId: req.query.classificationId ? Number(req.query.classificationId) : null,
    });
    return res.json(result);
  } catch (error) {
    console.error('Error listando clientes:', error);
    return res.status(500).json({ message: 'No se pudieron cargar los clientes.' });
  }
};

const getClientPayloadFromBody = (body: any, name: string) => ({
  name,
  description: getText(body?.description),
  rfc: getText(body?.rfc),
  website: getText(body?.website),
  address_street: getText(body?.address_street),
  address_neighborhood: getText(body?.address_neighborhood),
  address_city: getText(body?.address_city),
  address_state: getText(body?.address_state),
  address_zip: getText(body?.address_zip),
  address_country: getText(body?.address_country),
  notes: getText(body?.notes),
  classification_id: body?.classification_id === undefined || body?.classification_id === null
    ? null
    : Number(body.classification_id),
});

export const createClientController = async (req: AuthRequest, res: Response) => {
  const name = getText(req.body?.name);
  if (!name) {
    return res.status(400).json({ message: 'El nombre del cliente es obligatorio.' });
  }

  try {
    const client = await createClient(getClientPayloadFromBody(req.body, name));

    return res.status(201).json({ message: 'Cliente creado correctamente.', client });
  } catch (error: any) {
    const mappedError = mapClientError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error creando cliente:', error);
    return res.status(500).json({ message: 'No se pudo crear el cliente.' });
  }
};

export const updateClientController = async (req: AuthRequest, res: Response) => {
  const clientId = getNumberId(req.params.id);
  const name = getText(req.body?.name);
  if (!clientId) {
    return res.status(400).json({ message: 'ID de cliente invalido.' });
  }
  if (!name) {
    return res.status(400).json({ message: 'El nombre del cliente es obligatorio.' });
  }

  try {
    const client = await updateClient(clientId, getClientPayloadFromBody(req.body, name));

    if (!client) {
      return res.status(404).json({ message: 'Cliente no encontrado.' });
    }

    return res.json({ message: 'Cliente actualizado correctamente.', client });
  } catch (error: any) {
    const mappedError = mapClientError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error actualizando cliente:', error);
    return res.status(500).json({ message: 'No se pudo actualizar el cliente.' });
  }
};

export const deactivateClientController = async (req: AuthRequest, res: Response) => {
  const clientId = getNumberId(req.params.id);
  if (!clientId) {
    return res.status(400).json({ message: 'ID de cliente invalido.' });
  }

  try {
    const client = await deactivateClient(clientId);
    if (!client) {
      return res.status(404).json({ message: 'Cliente no encontrado.' });
    }

    return res.json({ message: 'Cliente desactivado correctamente.', client });
  } catch (error) {
    console.error('Error desactivando cliente:', error);
    return res.status(500).json({ message: 'No se pudo desactivar el cliente.' });
  }
};

export const listClientContactsController = async (req: AuthRequest, res: Response) => {
  const clientId = getNumberId(req.params.id);
  if (!clientId) {
    return res.status(400).json({ message: 'ID de cliente invalido.' });
  }

  try {
    const contacts = await listClientContacts(clientId);
    return res.json({ contacts });
  } catch (error) {
    console.error('Error listando contactos de cliente:', error);
    return res.status(500).json({ message: 'No se pudieron cargar los contactos.' });
  }
};

export const createClientContactController = async (req: AuthRequest, res: Response) => {
  const clientId = getNumberId(req.params.id);
  const name = getText(req.body?.name);
  if (!clientId) {
    return res.status(400).json({ message: 'ID de cliente invalido.' });
  }
  if (!name) {
    return res.status(400).json({ message: 'El nombre del contacto es obligatorio.' });
  }

  try {
    const contact = await createClientContact(clientId, {
      name,
      position: getText(req.body?.position),
      phone: getText(req.body?.phone),
      email: getText(req.body?.email),
      is_primary: Boolean(req.body?.is_primary),
    });

    return res.status(201).json({ message: 'Contacto agregado correctamente.', contact });
  } catch (error: any) {
    const mappedError = mapClientError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error creando contacto de cliente:', error);
    return res.status(500).json({ message: 'No se pudo agregar el contacto.' });
  }
};

export const updateClientContactController = async (req: AuthRequest, res: Response) => {
  const contactId = getNumberId(req.params.id);
  const name = getText(req.body?.name);
  if (!contactId) {
    return res.status(400).json({ message: 'ID de contacto invalido.' });
  }
  if (!name) {
    return res.status(400).json({ message: 'El nombre del contacto es obligatorio.' });
  }

  try {
    const contact = await updateClientContact(contactId, {
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
    const mappedError = mapClientError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error actualizando contacto de cliente:', error);
    return res.status(500).json({ message: 'No se pudo actualizar el contacto.' });
  }
};

export const deleteClientContactController = async (req: AuthRequest, res: Response) => {
  const contactId = getNumberId(req.params.id);
  if (!contactId) {
    return res.status(400).json({ message: 'ID de contacto invalido.' });
  }

  try {
    const removed = await deleteClientContact(contactId);
    if (!removed) {
      return res.status(404).json({ message: 'Contacto no encontrado.' });
    }

    return res.json({ message: 'Contacto eliminado correctamente.' });
  } catch (error) {
    console.error('Error eliminando contacto de cliente:', error);
    return res.status(500).json({ message: 'No se pudo eliminar el contacto.' });
  }
};

export const listClientDocumentCategoriesController = async (req: AuthRequest, res: Response) => {
  try {
    const includeInactive = parseBooleanQuery(req.query.includeInactive);
    const categories = await listClientDocumentCategories(includeInactive);
    return res.json({ categories });
  } catch (error) {
    console.error('Error listando categorias de documento de cliente:', error);
    return res.status(500).json({ message: 'No se pudieron cargar las categorias.' });
  }
};

export const createClientDocumentCategoryController = async (req: AuthRequest, res: Response) => {
  const name = getText(req.body?.name);
  if (!name) {
    return res.status(400).json({ message: 'El nombre de la categoria es obligatorio.' });
  }

  try {
    const category = await createClientDocumentCategory({
      code: getText(req.body?.code),
      name,
      description: getText(req.body?.description),
      sort_order: req.body?.sort_order === undefined ? null : Number(req.body?.sort_order),
    });

    return res.status(201).json({ message: 'Categoria creada correctamente.', category });
  } catch (error: any) {
    const mappedError = mapClientCatalogError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error creando categoria de documento de cliente:', error);
    return res.status(500).json({ message: 'No se pudo crear la categoria.' });
  }
};

export const updateClientDocumentCategoryController = async (req: AuthRequest, res: Response) => {
  const categoryId = getNumberId(req.params.id);
  const name = getText(req.body?.name);
  if (!categoryId) {
    return res.status(400).json({ message: 'ID de categoria invalido.' });
  }
  if (!name) {
    return res.status(400).json({ message: 'El nombre de la categoria es obligatorio.' });
  }

  try {
    const category = await updateClientDocumentCategory(categoryId, {
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
    const mappedError = mapClientCatalogError(res, error);
    if (mappedError) {
      return mappedError;
    }

    console.error('Error actualizando categoria de documento de cliente:', error);
    return res.status(500).json({ message: 'No se pudo actualizar la categoria.' });
  }
};

export const deactivateClientDocumentCategoryController = async (req: AuthRequest, res: Response) => {
  const categoryId = getNumberId(req.params.id);
  if (!categoryId) {
    return res.status(400).json({ message: 'ID de categoria invalido.' });
  }

  try {
    const category = await deactivateClientDocumentCategory(categoryId);
    if (!category) {
      return res.status(404).json({ message: 'Categoria no encontrada.' });
    }

    return res.json({ message: 'Categoria desactivada correctamente.', category });
  } catch (error) {
    console.error('Error desactivando categoria de documento de cliente:', error);
    return res.status(500).json({ message: 'No se pudo desactivar la categoria.' });
  }
};

export const deleteClientDocumentCategoryController = async (req: AuthRequest, res: Response) => {
  const categoryId = getNumberId(req.params.id);
  if (!categoryId) {
    return res.status(400).json({ message: 'ID de categoria invalido.' });
  }

  try {
    const removed = await deleteClientDocumentCategory(categoryId);
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

    console.error('Error eliminando categoria de documento de cliente:', error);
    return res.status(500).json({ message: 'No se pudo eliminar la categoria.' });
  }
};
