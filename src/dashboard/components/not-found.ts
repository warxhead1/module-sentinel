import { DashboardComponent, defineComponent } from './base-component.js';

export class NotFound extends DashboardComponent {
  async loadData(): Promise<void> {
    // No data to load
  }

  render() {
    this.shadow.innerHTML = `
      <style>
        :host {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          text-align: center;
          padding: 40px;
        }
        
        .container {
          max-width: 600px;
        }
        
        h1 {
          font-size: 6rem;
          font-weight: 300;
          background: linear-gradient(135deg, #4ecdc4, #44a08d);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          margin: 0;
        }
        
        h2 {
          font-size: 2rem;
          font-weight: 300;
          color: #fff;
          margin: 20px 0;
        }
        
        p {
          color: #888;
          font-size: 1.1rem;
          margin-bottom: 30px;
        }
        
        .home-link {
          display: inline-block;
          background: #4ecdc4;
          color: #000;
          padding: 12px 30px;
          border-radius: 8px;
          text-decoration: none;
          font-weight: 500;
          transition: all 0.3s ease;
        }
        
        .home-link:hover {
          background: #44a08d;
          transform: translateY(-2px);
        }
      </style>
      
      <div class="container">
        <h1>404</h1>
        <h2>Page Not Found</h2>
        <p>The page you're looking for doesn't exist or has been moved.</p>
        <a href="/" class="home-link">Go to Dashboard</a>
      </div>
    `;
  }
}

defineComponent('not-found', NotFound);