const { runRead, runWrite } = require('../services/neo4j.service');

/**
 * Récupère tous les rôles
 */
const getAllRoles = async (req, res) => {
    try {
        const result = await runRead('MATCH (r:Role) RETURN r');
        const roles = result.records.map(record => record.get('r').properties);
        res.json(roles);
    } catch (error) {
        console.error('Error getting roles:', error);
        res.status(500).json({ error: 'Failed to get roles', details: error.message });
    }
};

/**
 * Crée un nouveau rôle
 */
const createRole = async (req, res) => {
    const { name, description } = req.body;
    if (!name) {
        return res.status(400).json({ error: 'Role name is required' });
    }

    try {
        const result = await runWrite(
            'CREATE (r:Role {name: $name, description: $description}) RETURN r',
            { name, description: description || null }
        );
        
        if (!result.records.length) {
            throw new Error('Failed to create role');
        }
        
        const role = result.records[0].get('r').properties;
        res.status(201).json(role);
    } catch (error) {
        console.error('Error creating role:', error);
        res.status(500).json({ 
            error: 'Failed to create role',
            details: error.message 
        });
    }
};

/**
 * Met à jour un rôle existant
 */
const updateRole = async (req, res) => {
    const { id } = req.params;
    const { name, description } = req.body;

    if (!name) {
        return res.status(400).json({ error: 'Role name is required' });
    }

    try {
        // Vérifier d'abord si le rôle existe
        const checkResult = await runRead(
            'MATCH (r:Role) WHERE id(r) = toInteger($id) RETURN r',
            { id }
        );

        if (checkResult.records.length === 0) {
            return res.status(404).json({ 
                error: 'Role not found',
                details: `Role with ID ${id} does not exist`
            });
        }

        // Mettre à jour le rôle
        const result = await runWrite(
            'MATCH (r:Role) WHERE id(r) = toInteger($id) ' +
            'SET r.name = $name, r.description = $description, r.updatedAt = datetime() ' +
            'RETURN r',
            { 
                id, 
                name, 
                description: description || null 
            }
        );

        if (!result.records.length) {
            throw new Error('Failed to update role');
        }

        const role = result.records[0].get('r').properties;
        res.json(role);
    } catch (error) {
        console.error('Error updating role:', error);
        res.status(500).json({ 
            error: 'Failed to update role',
            details: error.message 
        });
    }
};

/**
 * Supprime un rôle
 */
const deleteRole = async (req, res) => {
    const { id } = req.params;

    try {
        // Vérifier d'abord si le rôle existe
        const checkResult = await runRead(
            'MATCH (r:Role) WHERE id(r) = toInteger($id) RETURN r',
            { id }
        );

        if (checkResult.records.length === 0) {
            return res.status(404).json({ 
                error: 'Role not found',
                details: `Role with ID ${id} does not exist`
            });
        }

        // Supprimer le rôle et toutes ses relations
        await runWrite(
            'MATCH (r:Role) WHERE id(r) = toInteger($id) ' +
            'DETACH DELETE r',
            { id }
        );

        res.status(204).send();
    } catch (error) {
        console.error('Error deleting role:', error);
        res.status(500).json({ 
            error: 'Failed to delete role',
            details: error.message
        });
    }
};

/**
 * Associe une permission à un rôle
 */
const assignPermissionToRole = async (req, res) => {
    const { name } = req.params;
    const { permissionName } = req.body;

    if (!permissionName) {
        return res.status(400).json({ 
            error: 'Permission name is required',
            details: 'Please provide permissionName in the request body'
        });
    }

    try {
        // Vérifier que le rôle et la permission existent
        const checkResult = await runRead(
            'MATCH (r:Role {name: $name}), (p:Permission {name: $permissionName}) ' +
            'RETURN r, p',
            { name, permissionName }
        );

        if (checkResult.records.length === 0) {
            return res.status(404).json({ 
                error: 'Role or Permission not found',
                details: `Role '${name}' or Permission '${permissionName}' does not exist`
            });
        }

        // Créer la relation GRANTS (au lieu de HAS_PERMISSION pour être cohérent avec le reste du code)
        const result = await runWrite(
            'MATCH (r:Role {name: $name}), (p:Permission {name: $permissionName}) ' +
            'MERGE (r)-[rel:GRANTS]->(p) ' +
            'RETURN rel',
            { name, permissionName }
        );

        if (!result.records.length) {
            throw new Error('Failed to assign permission to role');
        }

        res.status(201).json({ 
            success: true,
            message: `Permission '${permissionName}' successfully assigned to role '${name}'`
        });
    } catch (error) {
        console.error('Error assigning permission to role:', error);
        res.status(500).json({ 
            error: 'Failed to assign permission to role',
            details: error.message
        });
    }
};

module.exports = {
    getAllRoles,
    createRole,
    updateRole,
    deleteRole,
    assignPermissionToRole
};