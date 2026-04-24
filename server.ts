import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_PATH = path.join(__dirname, 'projects-db.json');

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

  // Initialize data file if it doesn't exist
  if (!fs.existsSync(DATA_PATH)) {
    const initialData = {
      projects: [
        {
          id: "project-1",
          title: "MoreSpace",
          description: "Dijital dünyada fark yaratan, kullanıcı deneyimi odaklı ve teknik mükemmeliyet hedefleyen profesyonel bir portfolyo örneği.",
          image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=2426&auto=format&fit=crop",
          github: "https://github.com/ardaanisancii",
          tags: ["React", "Tailwind", "Firebase"],
          order: 0
        }
      ],
      users: {}
    };
    fs.writeFileSync(DATA_PATH, JSON.stringify(initialData, null, 2));
  }

  // API Routes
  app.get('/api/projects', (req, res) => {
    try {
      const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
      res.json(data.projects);
    } catch (err) {
      res.status(500).json({ error: 'Failed to read data' });
    }
  });

  app.post('/api/projects', (req, res) => {
    try {
      const project = req.body;
      const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
      
      const newProject = {
        ...project,
        id: project.id || `project-${Date.now()}`
      };

      data.projects.unshift(newProject);

      // Also added to users if uid provided
      const uid = project.uid || project.userId;
      if (uid) {
        if (!data.users[uid]) data.users[uid] = { projects: [] };
        data.users[uid].projects.unshift(newProject);
      }

      fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
      res.json(newProject);
    } catch (err) {
      res.status(500).json({ error: 'Failed to save data' });
    }
  });

  app.put('/api/projects/:id', (req, res) => {
    try {
      const { id } = req.params;
      const updatedProject = req.body;
      const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));

      data.projects = data.projects.map((p: any) => p.id === id ? { ...p, ...updatedProject } : p);

      // Update in users as well
      Object.keys(data.users).forEach(uid => {
        if (data.users[uid].projects) {
          data.users[uid].projects = data.users[uid].projects.map((p: any) => 
            p.id === id ? { ...p, ...updatedProject } : p
          );
        }
      });

      fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to update data' });
    }
  });

  // Revised DELETE Route - Supports both /api/projects/:projectId and /api/projects/:uid/:projectId
  app.delete(['/api/projects/:uid/:projectId', '/api/projects/:projectId'], (req: any, res: any) => {
    try {
      const { uid, projectId } = req.params;
      const targetId = projectId || uid; // Fallback if only one param is provided
      
      console.log(`\n--- [BACKEND] DELETE REQUEST ---`);
      console.log(`Target ID: ${targetId}, UID: ${uid}`);

      if (!fs.existsSync(DATA_PATH)) {
        throw new Error('Data file not found');
      }

      const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
      const beforeCount = data.projects.length;

      // 1. Remove from global list (Strict comparison with String cast)
      data.projects = data.projects.filter((p: any) => String(p.id) !== String(targetId));
      const afterCount = data.projects.length;

      // 2. Remove from user lists
      let userLevelDeleted = false;
      
      // If we have a specific UID and that user exists
      if (uid && data.users && data.users[uid]) {
        const uBefore = data.users[uid].projects?.length || 0;
        data.users[uid].projects = (data.users[uid].projects || []).filter(
          (p: any) => String(p.id) !== String(targetId)
        );
        const uAfter = data.users[uid].projects?.length || 0;
        userLevelDeleted = uBefore !== uAfter;
      }

      // 3. Always search ALL users just in case (Safety Net)
      if (data.users) {
        Object.keys(data.users).forEach(key => {
          if (data.users[key].projects) {
            const initialLen = data.users[key].projects.length;
            data.users[key].projects = data.users[key].projects.filter(
              (p: any) => String(p.id) !== String(targetId)
            );
            if (data.users[key].projects.length !== initialLen) {
              userLevelDeleted = true;
            }
          }
        });
      }

      // 4. PERSIST TO DISK
      fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8');

      console.log(`Status: ${beforeCount !== afterCount || userLevelDeleted ? 'DELETED' : 'NOT FOUND'}`);
      console.log(`Global: ${beforeCount} -> ${afterCount}`);
      console.log(`------------------------------------------\n`);

      res.json({
        success: true,
        message: "Proje başarıyla silindi.",
        deletedId: targetId
      });
    } catch (err: any) {
      console.error("!!! [BACKEND ERROR] !!!", err);
      res.status(500).json({ error: err.message || 'Silme işlemi başarısız' });
    }
  });

  // Vite preview setup for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production statics
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
