/**
 * Vuex Store Plugin for HTTP Proxy Modal
 * Registers cluster store action to open proxy modal
 */

export default function(store: any) {
  // Register action in cluster module
  store.registerModule('proxyModal', {
    namespaced: true,
    
    state: {
      visible: false,
      resource: null,
      resourceType: 'pod',
    },
    
    mutations: {
      OPEN(state: any, payload: any) {
        state.visible = true;
        state.resource = payload.resource;
        state.resourceType = payload.resourceType;
      },
      
      CLOSE(state: any) {
        state.visible = false;
        state.resource = null;
      },
    },
    
    actions: {
      open({ commit }: any, payload: any) {
        commit('OPEN', payload);
      },
      
      close({ commit }: any) {
        commit('CLOSE');
      },
    },
  });
  
  // Also register in cluster namespace for convenience
  const originalDispatch = store.dispatch;
  store.dispatch = function(type: string, payload?: any, options?: any) {
    if (type === 'cluster/openProxyModal') {
      return originalDispatch.call(this, 'proxyModal/open', payload, options);
    }
    return originalDispatch.call(this, type, payload, options);
  };
}
