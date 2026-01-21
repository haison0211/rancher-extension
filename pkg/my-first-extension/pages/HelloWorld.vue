<template>
  <div class="hello-world-container">
    <div class="hero-section">
      <h1 class="title">
        🎉 Hello World!
      </h1>
      <p class="subtitle">
        Chào mừng bạn đến với Rancher Extension đầu tiên của bạn!
      </p>
      <div class="info-card">
        <h2>✅ Extension đang hoạt động!</h2>
        <ul class="feature-list">
          <li>📦 Extension Name: <strong>my-first-extension</strong></li>
          <li>🎯 Product Name: <strong>myFirstExtension</strong></li>
          <li>🚀 Version: <strong>0.1.0</strong></li>
          <li>⏰ Thời gian: <strong>{{ currentTime }}</strong></li>
        </ul>
      </div>
      
      <div class="action-section">
        <button class="btn btn-primary" @click="incrementCounter">
          👆 Click me! ({{ counter }})
        </button>
      </div>

      <div class="tips-section">
        <h3>💡 Các bước tiếp theo:</h3>
        <ol>
          <li>Customize component này trong <code>pkg/my-first-extension/pages/HelloWorld.vue</code></li>
          <li>Thêm routes mới trong <code>routing/extension-routing.ts</code></li>
          <li>Tạo models, list, edit, detail views</li>
          <li>Tham khảo API docs: <a href="https://extensions.rancher.io/extensions/next/api/overview" target="_blank">Extensions API</a></li>
        </ol>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'HelloWorld',
  
  data() {
    return {
      counter: 0,
      currentTime: new Date().toLocaleString('vi-VN'),
    };
  },

  mounted() {
    // Update time every second
    setInterval(() => {
      this.currentTime = new Date().toLocaleString('vi-VN');
    }, 1000);
  },

  methods: {
    incrementCounter() {
      this.counter++;
      this.$notify({
        title: 'Success',
        message: `Bạn đã click ${this.counter} lần! 🎉`,
        type: 'success',
      });
    },
  },
};
</script>

<style lang="scss" scoped>
.hello-world-container {
  padding: 20px;
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.hero-section {
  max-width: 800px;
  margin: 0 auto;
  background: white;
  border-radius: 16px;
  padding: 40px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.title {
  font-size: 3rem;
  text-align: center;
  color: #667eea;
  margin-bottom: 10px;
  font-weight: bold;
}

.subtitle {
  font-size: 1.2rem;
  text-align: center;
  color: #666;
  margin-bottom: 30px;
}

.info-card {
  background: #f8f9fa;
  border-left: 4px solid #667eea;
  padding: 20px;
  border-radius: 8px;
  margin-bottom: 30px;

  h2 {
    color: #667eea;
    margin-top: 0;
    margin-bottom: 15px;
  }
}

.feature-list {
  list-style: none;
  padding: 0;

  li {
    padding: 8px 0;
    font-size: 1.1rem;
    color: #444;

    strong {
      color: #667eea;
    }
  }
}

.action-section {
  text-align: center;
  margin: 30px 0;

  .btn {
    font-size: 1.2rem;
    padding: 15px 40px;
    border-radius: 50px;
    border: none;
    cursor: pointer;
    transition: all 0.3s ease;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    font-weight: bold;
    box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);

    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
    }

    &:active {
      transform: translateY(0);
    }
  }
}

.tips-section {
  margin-top: 30px;
  padding-top: 30px;
  border-top: 2px solid #eee;

  h3 {
    color: #667eea;
    margin-bottom: 15px;
  }

  ol {
    line-height: 2;
    color: #555;

    li {
      margin-bottom: 10px;
    }
  }

  code {
    background: #f8f9fa;
    padding: 2px 8px;
    border-radius: 4px;
    color: #e83e8c;
    font-family: 'Courier New', monospace;
  }

  a {
    color: #667eea;
    text-decoration: none;
    font-weight: bold;

    &:hover {
      text-decoration: underline;
    }
  }
}
</style>
